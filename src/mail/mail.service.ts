import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as nodemailer from 'nodemailer';
import { Readable } from 'stream';
import { MJMLtoHTML } from '../../handlers/mjmlToHtml';
import { ActiveAccountMail } from '../../templatesEmails/generates/GenerateActiveAccountMail';
import { ChangeCantityMail } from '../../templatesEmails/generates/GenerateChangeCantityMail';
import { generateMailChangeStatus } from '../../templatesEmails/generates/GenerateChangeStatusMail';
import { generateMailRejectDocument } from '../../templatesEmails/generates/GenerateRejectDocument';
import { GenerateMailSignup } from 'templatesEmails/generates/GenerateWelcome';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

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

  verifyToken(token: string): any {
    try {
      return this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch (error) {
      return null;
    }
  }

  private async getEmailSender(): Promise<string> {
    const email = this.configService.get<string>('GOOGLE_EMAIL');
    if (!email) {
      throw new Error('Email sender not properly configured');
    }
    return `"Credito Ya" ${email}`;
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

  async sendMailByUser(data: {
    subject: string;
    content: string;
    addressee: string | string[];
    files?: File[];
  }): Promise<nodemailer.SentMessageInfo> {
    try {
      const attachmentsFiles = data.files
        ? await Promise.all(
          data.files.map(async (file: File) => {
            const filename = `${Date.now()}-${file.name}`;

            // Create a readable stream from file buffer
            const fileArrayBuffer = await file.arrayBuffer();
            const fileBuffer = Buffer.from(fileArrayBuffer);
            const fileStream = new Readable();
            fileStream.push(fileBuffer);
            fileStream.push(null);

            return {
              filename,
              content: fileStream,
            };
          }),
        )
        : [];

      const mailData = await this.transporter.sendMail({
        from: await this.getEmailSender(),
        to: data.addressee,
        subject: data.subject,
        text: data.subject, // Usando el subject como texto por defecto
        html: data.content,
        attachments: attachmentsFiles,
      });

      return mailData;
    } catch (error) {
      console.error('Error sending mail with attachments:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  async sendMailByUserImage(data: {
    addressee: string;
    content: string;
    subject: string;
  }): Promise<nodemailer.SentMessageInfo> {
    try {
      const mailData = await this.transporter.sendMail({
        from: await this.getEmailSender(),
        to: data.addressee,
        subject: data.subject,
        text: data.subject, // Usando el subject como texto por defecto
        html: data.content,
      });

      return mailData;
    } catch (error) {
      console.error('Error sending image mail:', error);
      throw new Error(`Failed to send email with image: ${error.message}`);
    }
  }

  // specify Helpers

  async newClientMail(data: {
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
        text: `Hola ${data.completeName},

        ¡Gracias por registrarte en Crédito Ya! Estamos muy contentos de que te unas a nuestra comunidad.

        Desde ahora podrás disfrutar de una experiencia ágil, segura y confiable para gestionar tus créditos y oportunidades financieras.

        Si tienes alguna pregunta o necesitas ayuda, no dudes en escribirnos.

        ¡Bienvenido nuevamente!

        El equipo de Crédito Ya`,
        html,
      })
      
      return mailData;
    } catch (error) {
      console.error('Error sending welcome email:', error);
      throw new Error(`Failed to send welcome email: ${error.message}`);
    }
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
        text: `La cantidad requerida de tu préstamo #${data.loanId} ha cambiado a ${data.cantity_aproved}`,
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
        text: `El estado de tu préstamo #${data.loanId} ha cambiado a ${data.newStatus}`,
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
        text: `Un documento de tu préstamo #${data.loanId} ha sido rechazado`,
        html,
      });

      return mailData;
    } catch (error) {
      console.error('Error sending document rejection email:', error);
      throw new Error(`Failed to send document rejection email: ${error.message}`);
    }
  }
}