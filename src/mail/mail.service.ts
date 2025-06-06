import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Resend } from 'resend';
import { MJMLtoHTML } from '../../handlers/mjmlToHtml';
import { ActiveAccountMail } from '../../templatesEmails/generates/GenerateActiveAccountMail';
import { ChangeCantityMail } from '../../templatesEmails/generates/GenerateChangeCantityMail';
import { generateMailChangeStatus } from '../../templatesEmails/generates/GenerateChangeStatusMail';
import { generateMailRejectDocument } from '../../templatesEmails/generates/GenerateRejectDocument';
import { GenerateMailSignup } from 'templatesEmails/generates/GenerateWelcome';
import { generateMailTokenValidateLoan } from 'templatesEmails/generates/GenerateLoanTokenValidate';
import { generateMailCreateLoan } from 'templatesEmails/generates/GenerateCreateLoan';
import { generateMailPasswordReset } from 'templatesEmails/generates/GenerateRecoveryPass';
import { generateMailPasswordResetSuccess } from 'templatesEmails/generates/GenerateSuccesChangePass';
import { generateMailDisbursement } from "templatesEmails/generates/GenerateDisbursed";
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as stream from 'stream';

// Tipo para la cola de correos con Resend
interface EmailQueueItem {
  options: {
    from: string;
    to: string;
    subject: string;
    html: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType?: string;
    }>;
    priority?: 'high' | 'normal' | 'low';
  };
  attachmentFiles?: { filename: string; path: string }[];
  retryCount: number;
}

@Injectable()
export class MailService {
  private resend: Resend;
  private pipeline = util.promisify(stream.pipeline);
  private emailQueue: EmailQueueItem[] = [];
  private isProcessingQueue = false;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 5000; // 5 segundos
  private readonly QUEUE_PROCESSING_INTERVAL = 1000; // 1 segundo
  private readonly logger = new Logger(MailService.name);

  /**
   * Prepara la plantilla HTML de forma optimizada con caché
   */
  private mjmlCache = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // Inicializar Resend con la API key
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');

    if (!resendApiKey) {
      throw new Error('Resend API key not properly configured');
    }

    this.resend = new Resend(resendApiKey);

    this.logger.log('Resend service initialized successfully');

    // Iniciar el procesamiento de la cola
    this.startQueueProcessing();
  }

  /**
   * Inicia el procesamiento periódico de la cola de correos
   */
  private startQueueProcessing(): void {
    setInterval(() => this.processQueue(), this.QUEUE_PROCESSING_INTERVAL);
  }

  /**
   * Procesa la cola de correos pendientes
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.emailQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      const item = this.emailQueue.shift();
      if (!item) {
        this.isProcessingQueue = false;
        return;
      }

      try {
        // Enviar email usando Resend
        const result = await this.resend.emails.send(item.options);

        if (result.error) {
          throw new Error(result.error.message);
        }

        // Limpiar archivos temporales si existen
        if (item.attachmentFiles && item.attachmentFiles.length > 0) {
          const filePaths = item.attachmentFiles.map(attachment => attachment.path);
          await this.cleanupTempFiles(filePaths);
        }

        this.logger.log(`Email sent successfully to: ${item.options.to} (ID: ${result.data?.id})`);
      } catch (error) {
        this.logger.warn(`Failed to send email to ${item.options.to}: ${error.message}`);

        // Reintentar si no se ha alcanzado el límite de reintentos
        if (item.retryCount < this.MAX_RETRIES) {
          item.retryCount++;
          // Retraso exponencial entre reintentos
          setTimeout(() => {
            this.emailQueue.push(item);
            this.logger.log(`Queued email for retry (${item.retryCount}/${this.MAX_RETRIES})`);
          }, this.RETRY_DELAY * item.retryCount);
        } else {
          this.logger.error(`Maximum retries reached for email to ${item.options.to}`);
          // Limpiar archivos si hay un fallo definitivo
          if (item.attachmentFiles && item.attachmentFiles.length > 0) {
            await this.cleanupTempFiles(item.attachmentFiles.map(att => att.path));
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Añade un correo a la cola para su envío
   */
  private queueEmail(
    options: EmailQueueItem['options'],
    attachmentFiles?: { filename: string; path: string }[]
  ): void {
    this.emailQueue.push({
      options,
      attachmentFiles,
      retryCount: 0,
    });

    this.logger.log(`Email to ${options.to} added to queue. Queue size: ${this.emailQueue.length}`);
  }

  private async getEmailSender(type: 'default' | 'security' | 'notifications' = 'default'): Promise<string> {
    // Configuración de nombres de display y emails por tipo
    const senderConfig = {
      default: {
        name: 'Creditoya',
        email: this.configService.get<string>('SENDER_EMAIL') || 'noreply@creditoya.space'
      },
      security: {
        name: 'Creditoya Seguridad',
        email: this.configService.get<string>('SENDER_EMAIL_SECURITY') || 'seguridad@creditoya.space'
      },
      notifications: {
        name: 'Creditoya Notificaciones',
        email: this.configService.get<string>('SENDER_EMAIL_NOTIFICATIONS') || 'notificaciones@creditoya.space'
      }
    };

    const config = senderConfig[type];

    // Validar formato del email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(config.email)) {
      this.logger.error(`Invalid email format: ${config.email}`);
      throw new Error('Invalid email configuration');
    }

    // Validar dominio verificado
    const domain = config.email.split('@')[1];
    const allowedDomains = ['creditoya.space'];

    if (!allowedDomains.includes(domain)) {
      this.logger.error(`Email domain not verified: ${domain}`);
      throw new Error(`Email domain '${domain}' is not verified with Resend`);
    }

    // Retornar en formato "Display Name <email@domain.com>"
    return `${config.name} <${config.email}>`;
  }

  /**
   * Descarga documentos PDF desde URLs proporcionadas de forma paralela
   */
  async downloadPdfDocuments(urls: string[]): Promise<{ filename: string, path: string }[]> {
    if (!urls || urls.length === 0) {
      return [];
    }

    const tempDir = path.join(process.cwd(), 'temp');
    // Asegurarse de que exista el directorio temporal
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Descargar todos los documentos en paralelo
    const downloadPromises = urls.map(async (url, index) => {
      try {
        const response = await axios.get(url, {
          responseType: 'stream',
          timeout: 10000, // Timeout de 10 segundos para la descarga
        });

        // Generar un nombre único para el archivo
        const filename = `documento_${index + 1}_${Date.now()}.pdf`;
        const filePath = path.join(tempDir, filename);

        // Guardar el stream a un archivo
        await this.pipeline(response.data, fs.createWriteStream(filePath));

        return { filename, path: filePath };
      } catch (error) {
        this.logger.error(`Error al descargar el documento PDF desde ${url}: ${error.message}`);
        return null;
      }
    });

    const results = await Promise.all(downloadPromises);
    return results.filter(
      (result): result is { filename: string; path: string } => result !== null
    );
  }

  /**
   * Convierte archivos locales a attachments para Resend
   */
  private async prepareAttachments(files: { filename: string; path: string }[]): Promise<Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>> {
    const attachments: Array<{
      filename: string;
      content: Buffer;
      contentType?: string;
    }> = [];

    for (const file of files) {
      try {
        if (fs.existsSync(file.path)) {
          const content = fs.readFileSync(file.path);
          attachments.push({
            filename: file.filename,
            content,
            contentType: 'application/pdf'
          });
        }
      } catch (error) {
        this.logger.error(`Error preparing attachment ${file.filename}: ${error.message}`);
      }
    }

    return attachments;
  }

  /**
   * Limpia los archivos temporales después de enviar el correo
   */
  async cleanupTempFiles(filePaths: string[]): Promise<void> {
    const deletePromises = filePaths.map(filePath => {
      return new Promise<void>((resolve) => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            this.logger.debug(`Temporary file deleted: ${filePath}`);
          }
          resolve();
        } catch (error) {
          this.logger.error(`Error deleting temporary file ${filePath}: ${error.message}`);
          resolve(); // Resolvemos la promesa aunque haya error para no bloquear
        }
      });
    });

    await Promise.all(deletePromises);
  }

  private async prepareHtmlTemplate(mjmlContent: string): Promise<string> {
    // Usar un hash como clave de caché
    const contentHash = require('crypto')
      .createHash('md5')
      .update(mjmlContent)
      .digest('hex');

    // Verificar si ya existe en caché
    if (this.mjmlCache.has(contentHash)) {
      return this.mjmlCache.get(contentHash) ?? '';
    }

    // Si no está en caché, generar el HTML
    const html = await MJMLtoHTML(mjmlContent);

    // Guardar en caché
    this.mjmlCache.set(contentHash, html);

    // Mantener la caché con un tamaño razonable
    if (this.mjmlCache.size > 100) {
      const oldestKey = this.mjmlCache.keys().next().value;
      this.mjmlCache.delete(oldestKey);
    }

    return html;
  }

  // Métodos de envío de correo optimizados
  async sendActiveAccountMail(data: {
    completeName: string;
    mail: string;
    password: string;
  }): Promise<void> {
    try {
      if (!data.mail) {
        throw new Error('Missing required email address');
      }

      const content = ActiveAccountMail(data);
      const html = await this.prepareHtmlTemplate(content);

      const mailOptions = {
        from: await this.getEmailSender('default'), // Mostrará "Creditoya <noreply@creditoya.space>"
        to: data.mail,
        subject: 'Activación cuenta Intranet',
        html,
      };

      this.queueEmail(mailOptions);
    } catch (error) {
      this.logger.error(`Failed to prepare activation email: ${error.message}`);
      throw new Error(`Failed to send activation email: ${error.message}`);
    }
  }

  async sendNewClientMail(data: {
    mail: string,
    completeName: string
  }): Promise<void> {
    try {
      if (!data.mail) {
        throw new Error('Missing required email address');
      }

      const content = GenerateMailSignup(data.completeName);
      const html = await this.prepareHtmlTemplate(content);

      const mailOptions = {
        from: await this.getEmailSender(),
        to: data.mail,
        subject: '¡Bienvenido a Crédito Ya! Estamos felices de tenerte aquí',
        html,
      };

      this.queueEmail(mailOptions);
    } catch (error) {
      this.logger.error(`Failed to prepare welcome email: ${error.message}`);
      throw new Error(`Failed to send welcome email: ${error.message}`);
    }
  }

  async sendCreateNewLoan(data: {
    mail: string,
    loanId: string,
    reqCantity: string,
    documentUrls?: string[]
  }): Promise<void> {
    try {
      if (!data.mail || !data.loanId || !data.reqCantity) {
        throw new Error('Missing required fields for new loan email');
      }

      const { loanId, reqCantity } = data;
      const content = generateMailCreateLoan({ loanId, reqCantity });
      const html = await this.prepareHtmlTemplate(content);

      // Preparar las opciones básicas del correo
      const mailOptions: EmailQueueItem['options'] = {
        from: await this.getEmailSender(),
        to: data.mail,
        subject: 'Nueva solicitud de préstamo creada',
        html,
      };

      let downloadedFiles: { filename: string, path: string }[] = [];

      // Si hay URLs de documentos, descargarlos y añadirlos como adjuntos
      if (data.documentUrls && data.documentUrls.length > 0) {
        downloadedFiles = await this.downloadPdfDocuments(data.documentUrls);

        // Preparar attachments para Resend
        if (downloadedFiles.length > 0) {
          mailOptions.attachments = await this.prepareAttachments(downloadedFiles);
        }
      }

      // Enviar el correo con los adjuntos
      this.queueEmail(mailOptions, downloadedFiles);
    } catch (error) {
      this.logger.error(`Failed to prepare new loan email: ${error.message}`);
      throw new Error(`Failed to send new loan email: ${error.message}`);
    }
  }

  async sendLoanTokenVerification(data: {
    token: string
    mail: string
  }): Promise<void> {
    try {
      if (!data.mail || !data.token) {
        throw new Error('Missing required fields for token verification email');
      }

      const content = generateMailTokenValidateLoan({ token: data.token });
      const html = await this.prepareHtmlTemplate(content);

      const mailOptions = {
        from: await this.getEmailSender('security'), // Para verificaciones usar tipo security
        to: data.mail,
        subject: 'Código de verificación para tu solicitud de préstamo',
        html,
        priority: 'high' as 'high',
      };

      this.queueEmail(mailOptions);
    } catch (error) {
      this.logger.error(`Failed to prepare token verification email: ${error.message}`);
      throw new Error(`Failed to send token verification email: ${error.message}`);
    }
  }

  async sendChangeCantityMail(data: {
    employeeName: string;
    loanId: string;
    reason_aproved: string;
    cantity_aproved: string;
    mail: string;
  }): Promise<void> {
    try {
      if (!data.mail || !data.loanId || !data.cantity_aproved) {
        throw new Error('Missing required fields for change quantity email');
      }

      const content = ChangeCantityMail({
        employeeName: data.employeeName || 'Equipo Credito Ya',
        loanId: data.loanId,
        reason_aproved: data.reason_aproved || 'Ajuste en la cantidad solicitada',
        cantity_aproved: data.cantity_aproved,
      });

      const html = await this.prepareHtmlTemplate(content);

      const mailOptions = {
        from: await this.getEmailSender(),
        to: data.mail,
        subject: 'La cantidad requerida de tu préstamo ha cambiado',
        html,
      };

      this.queueEmail(mailOptions);
    } catch (error) {
      this.logger.error(`Failed to prepare change quantity email: ${error.message}`);
      throw new Error(`Failed to send change quantity email: ${error.message}`);
    }
  }

  async sendChangeStatusMail(data: {
    newStatus: string;
    employeeName: string;
    loanId: string;
    mail: string;
  }): Promise<void> {
    try {
      if (!data.mail || !data.loanId || !data.newStatus) {
        throw new Error('Missing required fields for status change email');
      }

      const content = generateMailChangeStatus({
        newStatus: data.newStatus,
        employeeName: data.employeeName || 'Equipo Creditoya',
        loanId: data.loanId,
      });

      const html = await this.prepareHtmlTemplate(content);

      const mailOptions = {
        from: await this.getEmailSender('notifications'), // Para notificaciones usar tipo notifications
        to: data.mail,
        subject: 'El estado de tu préstamo ha cambiado',
        html,
      };

      this.queueEmail(mailOptions);
    } catch (error) {
      this.logger.error(`Failed to prepare status change email: ${error.message}`);
      throw new Error(`Failed to send status change email: ${error.message}`);
    }
  }

  async sendDeleteDocMail(data: {
    loanId: string;
    mail: string
  }): Promise<void> {
    try {
      if (!data.mail || !data.loanId) {
        throw new Error('Missing required fields for document rejection email');
      }

      const content = generateMailRejectDocument({ loanId: data.loanId });
      const html = await this.prepareHtmlTemplate(content);

      const mailOptions = {
        from: await this.getEmailSender(),
        to: data.mail,
        subject: 'Un documento de tu préstamo ha sido rechazado',
        html,
      };

      this.queueEmail(mailOptions);
    } catch (error) {
      this.logger.error(`Failed to prepare document rejection email: ${error.message}`);
      throw new Error(`Failed to send document rejection email: ${error.message}`);
    }
  }

  async sendPasswordResetEmail({ userId, magicLink, to }: {
    to: string,
    magicLink: string,
    userId: string
  }): Promise<void> {
    try {
      if (!to || !magicLink || !userId) {
        throw new Error('Missing required fields for password reset email');
      }

      const content = generateMailPasswordReset({ userId, magicLink });
      const html = await this.prepareHtmlTemplate(content);

      const mailOptions = {
        from: await this.getEmailSender('security'), // Mostrará "Creditoya Seguridad <seguridad@creditoya.space>"
        to,
        subject: 'Recuperación de contraseña',
        html,
        priority: 'high' as 'high',
      };

      this.queueEmail(mailOptions);
    } catch (error) {
      this.logger.error(`Failed to prepare password reset email: ${error.message}`);
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }
  }

  async SendInfoChangePasswordSuccess({ userId, to }: { userId: string, to: string }): Promise<void> {
    try {
      if (!to || !userId) {
        throw new Error('Missing required fields for password change confirmation email');
      }

      const content = generateMailPasswordResetSuccess({ userId });
      const html = await this.prepareHtmlTemplate(content);

      const mailOptions = {
        from: await this.getEmailSender(),
        to,
        subject: 'Se ha restablecido tu contraseña',
        html,
        priority: 'high' as 'high', // Alta prioridad para correos de seguridad
      };

      this.queueEmail(mailOptions);
    } catch (error) {
      this.logger.error(`Failed to prepare password change confirmation email: ${error.message}`);
      throw new Error(`Failed to send password change confirmation email: ${error.message}`);
    }
  }

  async sendApprovalEmail(data: {
    loanId: string;
    mail: string
  }): Promise<void> {
    // TODO: Implementar
  }

  async sendRejectionEmail(data: {
    loanId: string;
    reason: string;
    mail: string
  }): Promise<void> {
    // TODO: Implementar
  }

  async sendDisbursementEmail(data: {
    mail: string;
    amount: string;
    bankAccount: string;
    loanId: string;
    disbursementDate: string;
  }): Promise<void> {
    try {
      if (!data.mail || !data.amount || !data.bankAccount || !data.loanId || !data.disbursementDate) {
        throw new Error('Missing required fields for disbursement email');
      }

      const content = generateMailDisbursement({
        amount: data.amount,
        bankAccount: data.bankAccount,
        loanId: data.loanId,
        disbursementDate: data.disbursementDate,
      });

      const html = await this.prepareHtmlTemplate(content);

      const mailOptions = {
        from: await this.getEmailSender('notifications'),
        to: data.mail,
        subject: '¡Tu préstamo ha sido desembolsado!',
        html,
        priority: 'high' as 'high',
      };

      this.queueEmail(mailOptions);

    } catch (error) {
      this.logger.error(`Failed to prepare disbursement email: ${error.message}`);
      throw new Error(`Failed to send disbursement email: ${error.message}`);
    }
  }

  // Método para uso en pruebas y depuración
  // async getQueueStatus(): Promise<{ queueSize: number, isProcessing: boolean }> {
  //   return {
  //     queueSize: this.emailQueue.length,
  //     isProcessing: this.isProcessingQueue
  //   };
  // }
}