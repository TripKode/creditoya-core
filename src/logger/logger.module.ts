import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { ApplicationLoggerService } from './service/application.service';
import { LoggerConfigService } from './service/config.service';
import { HttpTransportService } from './service/http-transport.service';

@Global()
@Module({
  providers: [
    ApplicationLoggerService,
    LoggerConfigService,
    LoggerService,
    HttpTransportService
  ],
  exports: [LoggerService]
})
export class LoggerModule {}
