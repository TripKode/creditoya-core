import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CatchService {
  private readonly logger = new Logger(CatchService.name);

  handle(error: any) {
    this.logger.error('Unhandled Exception:', error);
    // Aquí puedes enviar el error a una BD o un sistema de monitoreo
  }
}
