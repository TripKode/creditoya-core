import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MJMLtoHTML } from '../../handlers/mjmlToHtml';
import { ActiveAccountMail } from '../../templatesEmails/generates/GenerateActiveAccountMail';
import { ChangeCantityMail } from '../../templatesEmails/generates/GenerateChangeCantityMail';
import { generateMailChangeStatus } from '../../templatesEmails/generates/GenerateChangeStatusMail';
import { generateMailRejectDocument } from '../../templatesEmails/generates/GenerateRejectDocument';
import { GenerateMailSignup } from 'templatesEmails/generates/GenerateWelcome';
import { generateMailTokenValidateLoan } from 'templatesEmails/generates/GenerateLoanTokenValidate';
import { generateMailCreateLoan } from 'templatesEmails/generates/GenerateCreateLoan';
import * as nodemailer from 'nodemailer';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as stream from 'stream';
import { generateMailPasswordReset } from 'templatesEmails/generates/GenerateRecoveryPass';
import { generateMailPasswordResetSuccess } from 'templatesEmails/generates/GenerateSuccesChangePass';

// Tipo para la cola de correos
interface EmailQueueItem {
  options: nodemailer.SendMailOptions;
  attachments?: { filename: string; path: string }[];
  retryCount: number;
}

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
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
    // Inicializar transporter con verificación de variables de entorno
    const email = this.configService.get<string>('GOOGLE_EMAIL');
    const password = this.configService.get<string>('GOOGLE_PASSWORD');

    if (!email || !password) {
      throw new Error('Email credentials not properly configured');
    }

    // Configuración optimizada del transporter
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: email,
        pass: password,
      },
      pool: true, // Usar pool de conexiones
      maxConnections: 5, // Limitar a 5 conexiones simultáneas
      maxMessages: 100, // Límite de mensajes por conexión
      rateDelta: 1000, // Tiempo entre envíos (ms)
      rateLimit: 5, // Límite de mensajes en cada intervalo
    });

    // Verificar la conexión al iniciar
    this.verifyTransporter();

    // Iniciar el procesamiento de la cola
    this.startQueueProcessing();
  }

  /**
   * Verifica la conexión con el servidor de correo
   */
  private async verifyTransporter(): Promise<void> {
    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection established successfully');
    } catch (error) {
      this.logger.error(`SMTP connection failed: ${error.message}`);
      // Reintento de conexión después de un tiempo
      setTimeout(() => this.verifyTransporter(), 30000);
    }
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
        await this.transporter.sendMail(item.options);

        // Limpiar archivos temporales si existen
        if (item.attachments && item.attachments.length > 0) {
          const filePaths = item.attachments.map(attachment => attachment.path);
          await this.cleanupTempFiles(filePaths);
        }

        this.logger.log(`Email sent successfully to: ${item.options.to}`);
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
          if (item.attachments && item.attachments.length > 0) {
            await this.cleanupTempFiles(item.attachments.map(att => att.path));
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
  private queueEmail(options: nodemailer.SendMailOptions, attachments?: { filename: string; path: string }[]): void {
    this.emailQueue.push({
      options,
      attachments,
      retryCount: 0,
    });

    this.logger.log(`Email to ${options.to} added to queue. Queue size: ${this.emailQueue.length}`);
  }

  private async getEmailSender(): Promise<string> {
    const email = this.configService.get<string>('GOOGLE_EMAIL');
    if (!email) {
      throw new Error('Email sender not properly configured');
    }
    return `"Credito Ya" <${email}>`;
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
        from: await this.getEmailSender(),
        to: data.mail,
        subject: 'Activación cuenta Intranet',
        text: 'Activación de tu cuenta en Intranet de Credito Ya',
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
      const mailOptions: nodemailer.SendMailOptions = {
        from: await this.getEmailSender(),
        to: data.mail,
        subject: 'Nueva solicitud de préstamo creada',
        html,
        attachments: [] // Inicializar el array de adjuntos
      };

      let downloadedFiles: { filename: string, path: string }[] = [];

      // Si hay URLs de documentos, descargarlos y añadirlos como adjuntos
      if (data.documentUrls && data.documentUrls.length > 0) {
        downloadedFiles = await this.downloadPdfDocuments(data.documentUrls);

        // Añadir cada archivo descargado como adjunto
        if (downloadedFiles.length > 0) {
          mailOptions.attachments = downloadedFiles.map(file => ({
            filename: file.filename,
            path: file.path,
            contentType: 'application/pdf'
          }));
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
        from: await this.getEmailSender(),
        to: data.mail,
        subject: 'Código de verificación para tu solicitud de préstamo',
        html,
        priority: "high" as "high", // Alta prioridad para correos de verificación
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
        employeeName: data.employeeName || 'Equipo Credito Ya',
        loanId: data.loanId,
      });

      const html = await this.prepareHtmlTemplate(content);

      const mailOptions = {
        from: await this.getEmailSender(),
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

  async sendPasswordResetEmail({ userId, magicLink, to }: { to: string, magicLink: string, userId: string }): Promise<void> {
    try {
      if (!to || !magicLink || !userId) {
        throw new Error('Missing required fields for password reset email');
      }

      const content = generateMailPasswordReset({ userId, magicLink });
      const html = await this.prepareHtmlTemplate(content);

      const mailOptions = {
        from: await this.getEmailSender(),
        to,
        subject: 'Recuperación de contraseña',
        html,
        priority: 'high' as 'high', // Alta prioridad para correos de seguridad
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

  // Método para uso en pruebas y depuración
  // async getQueueStatus(): Promise<{ queueSize: number, isProcessing: boolean }> {
  //   return {
  //     queueSize: this.emailQueue.length,
  //     isProcessing: this.isProcessingQueue
  //   };
  // }
}