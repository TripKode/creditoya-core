import { Injectable, Logger } from '@nestjs/common';
import { CreateCatchDto } from './dto/create-catch.dto';
import { UpdateCatchDto } from './dto/update-catch.dto';

@Injectable()
export class CatchService {
  private readonly logger = new Logger(CatchService.name);

  handle(error: any) {
    this.logger.error('Unhandled Exception:', error);
    // Aquí puedes enviar el error a una BD o un sistema de monitoreo
  }
}
