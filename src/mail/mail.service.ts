import { Injectable } from '@nestjs/common';
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


@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private pipeline = util.promisify(stream.pipeline);

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

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: email,
        pass: password,
      },
    });
  }

  private async getEmailSender(): Promise<string> {
    const email = this.configService.get<string>('GOOGLE_EMAIL');
    if (!email) {
      throw new Error('Email sender not properly configured');
    }
    return `"Credito Ya" ${email}`;
  }

  /**
   * Descarga documentos PDF desde URLs proporcionadas
   * @param urls Array de URLs de documentos PDF para descargar
   * @returns Array de objetos con nombre de archivo y ruta del archivo descargado
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

    const downloadPromises = urls.map(async (url, index) => {
      try {
        const response = await axios.get(url, {
          responseType: 'stream',
        });

        // Generar un nombre único para el archivo
        const filename = `documento_${index + 1}_${Date.now()}.pdf`;
        const filePath = path.join(tempDir, filename);

        // Guardar el stream a un archivo
        await this.pipeline(response.data, fs.createWriteStream(filePath));

        return { filename, path: filePath };
      } catch (error) {
        console.error(`Error al descargar el documento PDF desde ${url}:`, error);
        return null;
      }
    });

    const results = await Promise.all(downloadPromises);
    return results.filter(
      (result): result is { filename: string; path: string } => result !== null
    ); // Filtrar posibles fallos de descarga
  }

  /**
   * Limpia los archivos temporales después de enviar el correo
   * @param filePaths Array de rutas de archivos a eliminar
   */
  async cleanupTempFiles(filePaths: string[]): Promise<void> {
    filePaths.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error(`Error al eliminar el archivo temporal ${filePath}:`, error);
      }
    });
  }

  async sendActiveAccountMail(data: {
    completeName: string;
    mail: string;
    password: string;
  }): Promise<nodemailer.SentMessageInfo> {
    try {
      const content = ActiveAccountMail(data);
      const html = await MJMLtoHTML(content);

      const mailData = await this.transporter.sendMail({
        from: await this.getEmailSender(),
        to: data.mail,
        subject: 'Activación cuenta Intranet',
        text: 'Activación de tu cuenta en Intranet de Credito Ya',
        html,
      });

      return mailData;
    } catch (error) {
      console.error('Error sending activation email:', error);
      throw new Error(`Failed to send activation email: ${error.message}`);
    }
  }

  // specify Helpers

  async sendNewClientMail(data: {
    mail: string,
    completeName: string
  }) {
    try {
      if (!data.mail) {
        throw new Error('Missing required email');
      }

      const content = GenerateMailSignup(data.completeName);
      const html = await MJMLtoHTML(content);

      const mailData = await this.transporter.sendMail({
        from: await this.getEmailSender(),
        to: data.mail,
        subject: '¡Bienvenido a Crédito Ya! Estamos felices de tenerte aquí',
        html,
      })

      return mailData;
    } catch (error) {
      console.error('Error sending welcome email:', error);
      throw new Error(`Failed to send welcome email: ${error.message}`);
    }
  }

  async sendCreateNewLoan(data: {
    mail: string,
    loanId: string,
    reqCantity: string,
    documentUrls?: string[] // Nuevo parámetro opcional para URLs de documentos
  }) {
    try {
      if (!data.mail || !data.loanId || !data.reqCantity) {
        throw new Error('Missing required fields email');
      }

      const { loanId, reqCantity } = data;
      const content = generateMailCreateLoan({ loanId, reqCantity });
      const html = await MJMLtoHTML(content);

      // Preparar las opciones básicas del correo
      const mailOptions: nodemailer.SendMailOptions = {
        from: await this.getEmailSender(),
        to: data.mail,
        subject: 'Nueva solicitud de préstamo creada',
        html,
        attachments: [] // Inicializar el array de adjuntos
      };

      // Si hay URLs de documentos, descargarlos y añadirlos como adjuntos
      if (data.documentUrls && data.documentUrls.length > 0) {
        const downloadedFiles = await this.downloadPdfDocuments(data.documentUrls);

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
      const mailData = await this.transporter.sendMail(mailOptions);

      // Limpiar archivos temporales si los había
      if (mailOptions.attachments && mailOptions.attachments.length > 0) {
        const filePaths = mailOptions.attachments.map(attachment => attachment.path as string);
        await this.cleanupTempFiles(filePaths);
      }

      return mailData;
    } catch (error) {
      console.error('Error sending new loan email with attachments:', error);
      throw new Error(`Failed to send new loan email: ${error.message}`);
    }
  }

  async sendLoanTokenVerification(data: {
    token: string
    mail: string
  }) {
    if (!data.mail || !data.token) {
      throw new Error('Missing required fields email');
    }

    const content = generateMailTokenValidateLoan({ token: data.token });
    const html = await MJMLtoHTML(content);

    const mailData = await this.transporter.sendMail({
      from: await this.getEmailSender(),
      to: data.mail,
      subject: 'Código de verificación para tu solicitud de préstamo',
      html,
    });

    return mailData;
  }

  async sendChangeCantityMail(data: {
    employeeName: string;
    loanId: string;
    reason_aproved: string;
    cantity_aproved: string;
    mail: string;
  }): Promise<nodemailer.SentMessageInfo> {
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

      const html = await MJMLtoHTML(content);

      const mailData = await this.transporter.sendMail({
        from: await this.getEmailSender(),
        to: data.mail,
        subject: 'La cantidad requerida de tu préstamo ha cambiado',
        html,
      });

      return mailData;
    } catch (error) {
      console.error('Error sending change quantity email:', error);
      throw new Error(`Failed to send change quantity email: ${error.message}`);
    }
  }

  async sendChangeStatusMail(data: {
    newStatus: string;
    employeeName: string;
    loanId: string;
    mail: string;
  }): Promise<nodemailer.SentMessageInfo> {
    try {
      if (!data.mail || !data.loanId || !data.newStatus) {
        throw new Error('Missing required fields for status change email');
      }

      const content = generateMailChangeStatus({
        newStatus: data.newStatus,
        employeeName: data.employeeName || 'Equipo Credito Ya',
        loanId: data.loanId,
      });

      const html = await MJMLtoHTML(content);

      const mailData = await this.transporter.sendMail({
        from: await this.getEmailSender(),
        to: data.mail,
        subject: 'El estado de tu préstamo ha cambiado',
        html,
      });

      return mailData;
    } catch (error) {
      console.error('Error sending status change email:', error);
      throw new Error(`Failed to send status change email: ${error.message}`);
    }
  }

  async sendDeleteDocMail(data: {
    loanId: string;
    mail: string
  }): Promise<nodemailer.SentMessageInfo> {
    try {
      if (!data.mail || !data.loanId) {
        throw new Error('Missing required fields for document rejection email');
      }

      const content = generateMailRejectDocument({ loanId: data.loanId });
      const html = await MJMLtoHTML(content);

      const mailData = await this.transporter.sendMail({
        from: await this.getEmailSender(),
        to: data.mail,
        subject: 'Un documento de tu préstamo ha sido rechazado',
        html,
      });

      return mailData;
    } catch (error) {
      console.error('Error sending document rejection email:', error);
      throw new Error(`Failed to send document rejection email: ${error.message}`);
    }
  }

  /**
   * Envía un correo electrónico con el magic link para recuperar contraseña
   * @param to Email del destinatario
   * @param magicLink URL del magic link
   * @param userType Tipo de usuario (cliente o intranet)
   */
  async sendPasswordResetEmail({ userType, userId, magicLink, to }: { to: string, magicLink: string, userType: string, userId: string }): Promise<void> {
    const appName = userType === 'client' ? 'CreditoYa' : 'CreditoYa Intranet';

    const content = generateMailPasswordReset({ userId, magicLink })
    const html = await MJMLtoHTML(content);

    await this.transporter.sendMail({
      from: await this.getEmailSender(),
      to,
      subject: 'Recuperación de contraseña',
      html,
    });
  }

  async SendInfoChangePasswordSuccess({ userId, to } : {userId: string, to: string}) {
    const content = generateMailPasswordResetSuccess({ userId })
    const html = await MJMLtoHTML(content);

    await this.transporter.sendMail({
      from: await this.getEmailSender(),
      to,
      subject: 'Se ha restablecido tu contraseña',
      html,
    });
  }

  async sendApprovalEmail(data: {
    loanId: string;
    mail: string
  }): Promise<nodemailer.SentMessageInfo> { }

  async sendRejectionEmail(data: {
    loanId: string;
    reason: string;
    mail: string
  }): Promise<nodemailer.SentMessageInfo> { }
}