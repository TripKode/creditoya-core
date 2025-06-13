import { Injectable, LogLevel } from '@nestjs/common';
import pino from 'pino';
import { HttpTransportService } from './service/http-transport.service';

@Injectable()
export class LoggerService {
  private readonly logger: pino.Logger;
  public context: string = 'Application';

  constructor(
    private readonly httpTransport: HttpTransportService
  ) {

    // Configuración según entorno
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = !isProduction;

    // Crear stream personalizado para HTTP transport
    const httpStream = this.httpTransport.createHttpStream();

    this.logger = pino({
      name: 'nestjs-app',
      level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),

      // Configuración de formato según entorno
      ...(isDevelopment && {
        transport: {
          targets: [
            {
              target: 'pino-pretty',
              level: 'debug',
              options: {
                colorize: true,
                translateTime: 'yyyy-mm-dd HH:MM:ss',
                ignore: 'pid,hostname',
                messageFormat: '{context} {msg}',
                levelFirst: false,
                crlf: false
              }
            }
          ]
        }
      }),

      // En producción, usar formato JSON estructurado
      ...(isProduction && {
        formatters: {
          level: (label) => {
            return { level: label };
          }
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        messageKey: 'message',
        errorKey: 'error'
      }),

      // Campos base que siempre incluir
      base: {
        pid: process.pid,
        hostname: require('os').hostname(),
        environment: process.env.NODE_ENV || 'development',
        service: 'core-creditoya',
        version: process.env.npm_package_version || '1.0.0'
      }
    },
      // Agregar el stream HTTP si está habilitado
      this.httpTransport.config.httpTransportEnabled ? pino.multistream([
        { stream: process.stdout },
        { stream: httpStream, level: this.httpTransport.config.httpTransportLevel }
      ]) : undefined
    );

    // Log de inicialización del HTTP transport
    if (this.httpTransport.config.httpTransportEnabled) {
      console.log(`[LoggerService] HTTP Transport habilitado - Endpoint: ${this.httpTransport.config.errorEndpoint}`);
      console.log(`[LoggerService] HTTP Transport Level: ${this.httpTransport.config.httpTransportLevel}`);
    }
  }

  // Método para establecer el contexto después de la inicialización
  setContext(context: string): void {
    (this as any).context = context;
  }

  // Método de logging general que acepta diferentes niveles
  log(message: string, level: LogLevel = 'log', meta?: any) {
    const logData = { context: this.context, ...meta };

    switch (level) {
      case 'debug':
        this.logger.debug(logData, message);
        break;
      case 'verbose':
      case 'log':
        this.logger.info(logData, message);
        break;
      case 'warn':
        this.logger.warn(logData, message);
        break;
      case 'error':
        this.logger.error(logData, message);
        break;
      case 'fatal':
        this.logger.fatal(logData, message);
        break;
      default:
        this.logger.info(logData, message);
    }
  }

  // Métodos de logging estándar
  debug(message: string, meta?: any) {
    this.logger.debug({ context: this.context, ...meta }, message);
  }

  info(message: string, meta?: any) {
    this.logger.info({ context: this.context, ...meta }, message);
  }

  warn(message: string, meta?: any) {
    this.logger.warn({ context: this.context, ...meta }, message);
  }

  error(message: string, error?: any, meta?: any) {
    const errorInfo = error instanceof Error
      ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      }
      : error;

    this.logger.error({
      context: this.context,
      error: errorInfo,
      ...meta
    }, message);
  }

  fatal(message: string, error?: any, meta?: any) {
    const errorInfo = error instanceof Error
      ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      }
      : error;

    this.logger.fatal({
      context: this.context,
      error: errorInfo,
      ...meta
    }, message);
  }

  // Crear logger hijo con contexto específico
  child(context: string): LoggerService {
    const childLogger = new LoggerService(this.httpTransport);
    childLogger.setContext(context);
    return childLogger;
  }

  // Obtener el logger nativo de Pino para casos especiales
  getRawLogger(): pino.Logger {
    return this.logger;
  }
}