import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Logger
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { MailService } from './mail.service';
import { SendCustomEmailDto } from './dto/create-mail.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiBadRequestResponse
} from '@nestjs/swagger';

@ApiTags('mail')
@Controller('mail')
export class MailController {
  private readonly logger = new Logger(MailController.name);

  constructor(private readonly mailService: MailService) { }

  @Post('send-custom')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiOperation({ summary: 'Enviar correo electrónico personalizado' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Datos del correo personalizado con archivos adjuntos',
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Correo electrónico del destinatario' },
        subject: { type: 'string', description: 'Asunto del correo' },
        message: { type: 'string', description: 'Contenido del mensaje' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Archivos adjuntos (máximo 10)'
        }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Correo enviado exitosamente' })
  @ApiBadRequestResponse({ description: 'Error al enviar el correo' })
  async sendCustomEmail(
    @Body() sendCustomEmailDto: SendCustomEmailDto,
    @UploadedFiles() files?: Express.Multer.File[]
  ) {
    try {
      this.logger.log(`Sending custom email to: ${sendCustomEmailDto.email}`);

      await this.mailService.sendCustomEmail({
        ...sendCustomEmailDto,
        files: files || []
      });

      return {
        success: true,
        message: 'Email enviado exitosamente',
        data: {
          to: sendCustomEmailDto.email,
          subject: sendCustomEmailDto.subject,
          attachmentCount: files?.length || 0
        }
      };
    } catch (error) {
      this.logger.error(`Failed to send custom email: ${error.message}`);
      throw new BadRequestException({
        success: false,
        message: 'Error al enviar el correo',
        error: error.message
      });
    }
  }

  @Post('send-announcement')
  @UseInterceptors(FilesInterceptor('bannerImage', 1))
  @ApiOperation({ summary: 'Enviar correo electrónico de anuncio' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Datos del anuncio con imagen opcional',
    schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Asunto del correo' },
        email: { type: 'string', description: 'Correo electrónico del destinatario' },
        title: { type: 'string', description: 'Título del anuncio' },
        message: { type: 'string', description: 'Mensaje principal' },
        additionalMessages: { type: 'string', description: 'Mensajes adicionales en formato JSON' },
        recipientName: { type: 'string', description: 'Nombre del destinatario' },
        priority: { type: 'string', enum: ['high'], description: 'Prioridad del correo' },
        senderName: { type: 'string', description: 'Nombre del remitente' },
        bannerImage: {
          type: 'string',
          format: 'binary',
          description: 'Imagen de banner (opcional)'
        }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Correo de anuncio enviado exitosamente' })
  @ApiBadRequestResponse({ description: 'Error al enviar el correo de anuncio' })
  async sendAnnouncementEmail(
    @Body() announcementData: {
      subject: string;
      email: string;
      title: string;
      message: string;
      additionalMessages?: string; // JSON string
      recipientName?: string;
      priority?: 'high';
      senderName?: string;
    },
    @UploadedFiles() bannerImage?: Express.Multer.File[]
  ) {
    try {
      this.logger.log(`Sending announcement email to: ${announcementData.email}`);

      // Parsear additionalMessages si viene como string JSON
      let additionalMessages: { title: string; content: string }[] | undefined;
      if (announcementData.additionalMessages) {
        try {
          additionalMessages = JSON.parse(announcementData.additionalMessages);
        } catch (error) {
          this.logger.warn('Failed to parse additionalMessages, ignoring field');
        }
      }

      await this.mailService.sendAnnouncementEmail({
        subject: announcementData.subject,
        email: announcementData.email,
        title: announcementData.title,
        message: announcementData.message,
        additionalMessages,
        recipientName: announcementData.recipientName,
        priority: announcementData.priority,
        senderName: announcementData.senderName,
        bannerImage: bannerImage || []
      });

      return {
        success: true,
        message: 'Email de anuncio enviado exitosamente',
        data: {
          to: announcementData.email,
          subject: announcementData.subject,
          title: announcementData.title,
          hasBannerImage: bannerImage && bannerImage.length > 0
        }
      };
    } catch (error) {
      this.logger.error(`Failed to send announcement email: ${error.message}`);
      throw new BadRequestException({
        success: false,
        message: 'Error al enviar el correo de anuncio',
        error: error.message
      });
    }
  }

  @Get('queue-status')
  @ApiOperation({ summary: 'Obtener estado de la cola de correos' })
  @ApiResponse({ status: 200, description: 'Estado de la cola obtenido exitosamente' })
  @ApiBadRequestResponse({ description: 'Error al obtener el estado de la cola' })
  async getQueueStatus() {
    try {
      const status = await this.mailService.getQueueStatus();
      return {
        success: true,
        data: status
      };
    } catch (error) {
      this.logger.error(`Failed to get queue status: ${error.message}`);
      throw new BadRequestException({
        success: false,
        message: 'Error al obtener el estado de la cola',
        error: error.message
      });
    }
  }
}