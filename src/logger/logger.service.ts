import { Injectable, LogLevel } from '@nestjs/common';
import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import { HttpTransportService } from './service/http-transport.service';

@Injectable()
export class LoggerService {
  private readonly logger: pino.Logger;
  private readonly fileStream: pino.DestinationStream;
  private readonly logsDirectory: string;
  public context: string = 'Application';

  constructor(
    private readonly httpTransport: HttpTransportService
  ) {
    // Configuración según entorno
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = !isProduction;

    // Configurar directorio de logs
    this.logsDirectory = path.join(process.cwd(), 'logs');
    this.ensureLogsDirectory();

    // Crear stream para archivo de logs
    const logFileName = `app-${new Date().toISOString().split('T')[0]}.log`;
    const logFilePath = path.join(this.logsDirectory, logFileName);
    this.fileStream = pino.destination({
      dest: logFilePath,
      sync: false,
      mkdir: true
    });

    // Configurar streams múltiples
    const streams: pino.StreamEntry[] = [];

    // Stream para archivo (siempre debug para guardar todo)
    streams.push({
      stream: this.fileStream,
      level: 'debug'
    });

    // Stream HTTP si está habilitado
    if (this.httpTransport.config.httpTransportEnabled) {
      const httpStream = this.httpTransport.createHttpStream();
      streams.push({
        stream: httpStream,
        level: (this.httpTransport.config.httpTransportLevel || 'debug') as pino.Level
      });
    }

    // Configurar el logger principal
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
    }, pino.multistream(streams));

    // Log de inicialización
    console.log(`[LoggerService] Logs guardándose en: ${logFilePath}`);
    console.log(`[LoggerService] Directorio de logs: ${this.logsDirectory}`);

    if (this.httpTransport.config.httpTransportEnabled) {
      console.log(`[LoggerService] HTTP Transport habilitado - Endpoint: ${this.httpTransport.config.logEndpoint}`);
      console.log(`[LoggerService] HTTP Transport Level: ${this.httpTransport.config.httpTransportLevel}`);
      console.log(`[LoggerService] HTTP Transport Niveles habilitados: [${this.httpTransport.config.enabledLevels.join(', ')}]`);
      console.log(`[LoggerService] HTTP Transport Batch Size: ${this.httpTransport.config.batchSize}`);
      console.log(`[LoggerService] HTTP Transport Flush Interval: ${this.httpTransport.config.flushInterval}ms`);
    }

    // Log inicial para verificar que todo funciona
    this.info('LoggerService inicializado correctamente', {
      logsDirectory: this.logsDirectory,
      logFileName,
      httpTransportEnabled: this.httpTransport.config.httpTransportEnabled,
      httpTransportConfig: this.httpTransport.getStats()
    });

    // Test de conectividad HTTP si está habilitado
    if (this.httpTransport.config.httpTransportEnabled) {
      this.testHttpTransport();
    }
  }

  private ensureLogsDirectory(): void {
    try {
      if (!fs.existsSync(this.logsDirectory)) {
        fs.mkdirSync(this.logsDirectory, { recursive: true });
        console.log(`[LoggerService] Directorio de logs creado: ${this.logsDirectory}`);
      }
    } catch (error) {
      console.error(`[LoggerService] Error creando directorio de logs:`, error);
    }
  }

  // Método para establecer el contexto después de la inicialización
  setContext(context: string): void {
    (this as any).context = context;
  }

  // Método de logging general que acepta diferentes niveles
  log(message: string, level: LogLevel = 'log', meta?: any) {
    const logData = {
      context: this.context,
      timestamp: new Date().toISOString(),
      ...meta
    };

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
    this.logger.debug({
      context: this.context,
      timestamp: new Date().toISOString(),
      level: 'debug',
      ...meta
    }, message);
  }

  info(message: string, meta?: any) {
    this.logger.info({
      context: this.context,
      timestamp: new Date().toISOString(),
      level: 'info',
      ...meta
    }, message);
  }

  warn(message: string, meta?: any) {
    this.logger.warn({
      context: this.context,
      timestamp: new Date().toISOString(),
      level: 'warn',
      ...meta
    }, message);
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
      timestamp: new Date().toISOString(),
      level: 'error',
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
      timestamp: new Date().toISOString(),
      level: 'fatal',
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

  // Método para obtener información sobre archivos de logs
  getLogsInfo(): { directory: string; currentFile: string; files: string[] } {
    try {
      const files = fs.readdirSync(this.logsDirectory)
        .filter(file => file.endsWith('.log'))
        .sort((a, b) => b.localeCompare(a)); // Ordenar por fecha descendente

      const currentFile = `app-${new Date().toISOString().split('T')[0]}.log`;

      return {
        directory: this.logsDirectory,
        currentFile,
        files
      };
    } catch (error) {
      this.error('Error obteniendo información de logs', error);
      return {
        directory: this.logsDirectory,
        currentFile: '',
        files: []
      };
    }
  }

  // Método para limpiar logs antiguos (opcional)
  cleanOldLogs(daysToKeep: number = 7): void {
    try {
      const files = fs.readdirSync(this.logsDirectory)
        .filter(file => file.endsWith('.log'));

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      files.forEach(file => {
        const filePath = path.join(this.logsDirectory, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          this.info(`Log antiguo eliminado: ${file}`, { daysToKeep });
        }
      });
    } catch (error) {
      this.error('Error limpiando logs antiguos', error);
    }
  }

  // Método para cerrar streams al terminar la aplicación
  async close(): Promise<void> {
    try {
      this.info('Cerrando LoggerService...');

      // Cerrar el stream de archivo
      if (this.fileStream) {
        await new Promise<void>((resolve) => {
          if (typeof (this.fileStream as any).end === 'function') {
            (this.fileStream as any).end(() => {
              resolve();
            });
          } else {
            // Si no existe el método end, simplemente resuelve
            resolve();
          }
        });
      }

      // Cerrar el logger
      this.logger.flush();

      console.log('[LoggerService] Cerrado correctamente');
    } catch (error) {
      console.error('[LoggerService] Error al cerrar:', error);
    }
  }

  private async testHttpTransport(): Promise<void> {
    try {
      const isConnected = await this.httpTransport.testConnection();
      if (isConnected) {
        this.info('HTTP Transport conectado exitosamente', {
          endpoint: this.httpTransport.config.logEndpoint,
          levels: this.httpTransport.config.enabledLevels
        });
      } else {
        this.warn('HTTP Transport no pudo conectarse', {
          endpoint: this.httpTransport.config.logEndpoint
        });
      }
    } catch (error) {
      this.error('Error probando HTTP Transport', error);
    }
  }
}