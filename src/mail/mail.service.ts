// mail.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as nodemailer from 'nodemailer';
import { Readable } from 'stream';
import { MJMLtoHTML } from '../../handlers/mjmlToHtml';
import { ActiveAccountMail } from '../../templatesEmails/generates/GenerateActiveAccountMail'
import { ChangeCantityMail } from '../../templatesEmails/generates/GenerateChangeCantityMail';
import { generateMailChangeStatus } from '../../templatesEmails/generates/GenerateChangeStatusMail';
import { generateMailRejectDocument } from '../../templatesEmails/generates/GenerateRejectDocument';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('GOOGLE_EMAIL'),
        pass: this.configService.get<string>('GOOGLE_PASSWORD'),
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

  async sendActiveAccountMail(data: {
    completeName: string;
    mail: string;
    password: string;
  }) {
    const content = ActiveAccountMail(data);
    const html = await MJMLtoHTML(content);

    const mailData = await this.transporter.sendMail({
      from: `"Credito ya" ${this.configService.get<string>('GOOGLE_EMAIL')}`,
      to: data.mail,
      subject: 'Activacion cuenta Intranet',
      text: '¡Funciona!',
      html,
    });

    return mailData;
  }

  async sendMailByUser(data: {
    subject: string;
    content: string;
    addressee: string | string[];
    files?: File[];
  }) {
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
              filename: filename,
              content: fileStream,
            };
          }),
        )
      : [];

    const mailData = await this.transporter.sendMail({
      from: `"Credito ya" ${this.configService.get<string>('GOOGLE_EMAIL')}`,
      to: data.addressee,
      subject: data.subject,
      text: '¡Funciona!',
      html: data.content,
      attachments: attachmentsFiles,
    });

    return mailData;
  }

  async sendMailByUserImage(data: {
    addressee: string;
    content: string;
    subject: string;
  }) {
    const mailData = await this.transporter.sendMail({
      from: `"Credito ya" ${this.configService.get<string>('GOOGLE_EMAIL')}`,
      to: data.addressee,
      subject: data.subject,
      text: '¡Funciona!',
      html: data.content,
    });

    return mailData;
  }

  async sendChangeCantityMail(data: {
    employeeName: string;
    loanId: string;
    reason_aproved: string;
    cantity_aproved: string;
    mail: string;
  }) {
    const content = ChangeCantityMail({
      employeeName: data.employeeName,
      loanId: data.loanId,
      reason_aproved: data.reason_aproved,
      cantity_aproved: data.cantity_aproved,
    });

    const html = await MJMLtoHTML(content);

    const mailData = await this.transporter.sendMail({
      from: `"Credito ya" ${this.configService.get<string>('GOOGLE_EMAIL')}`,
      to: data.mail,
      subject: 'La cantidad requerida de tu prestamo ha cambiado',
      text: '¡Funciona!',
      html,
    });

    return mailData;
  }

  async sendChangeStatusMail(data: {
    newStatus: string;
    employeeName: string;
    loanId: string;
    mail: string;
  }) {
    const content = generateMailChangeStatus({
      newStatus: data.newStatus,
      employeeName: data.employeeName,
      loanId: data.loanId,
    });

    const html = await MJMLtoHTML(content);

    const mailData = await this.transporter.sendMail({
      from: `"Credito ya" ${this.configService.get<string>('GOOGLE_EMAIL')}`,
      to: data.mail,
      subject: 'El estado de tu prestamo ha cambiado',
      text: '¡Funciona!',
      html,
    });

    return mailData;
  }

  async sendDeleteDocMail(data: { loanId: string; mail: string }) {
    const content = generateMailRejectDocument({ loanId: data.loanId });
    const html = await MJMLtoHTML(content);

    const mailData = await this.transporter.sendMail({
      from: `"Credito ya" ${this.configService.get<string>('GOOGLE_EMAIL')}`,
      to: data.mail,
      subject: 'Un documento de tu prestamo a sido rechazado',
      text: '¡Funciona!',
      html,
    });

    return mailData;
  }
}