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

@Controller('mail')
export class MailController {
  private readonly logger = new Logger(MailController.name);

  constructor(private readonly mailService: MailService) { }

  @Post('send-custom')
  @UseInterceptors(FilesInterceptor('files', 10))
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

  @Get('queue-status')
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