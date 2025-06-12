import { Injectable, LogLevel } from '@nestjs/common';
import pino from 'pino';

@Injectable()
export class LoggerService {
    private readonly logger: pino.Logger;
    private readonly context: string = 'Application';

    constructor(context?: string) {
        if (context) {
            this.context = context;
        }

        // Configuración según entorno
        const isProduction = process.env.NODE_ENV === 'production';
        const isDevelopment = !isProduction;

        this.logger = pino({
            name: 'nestjs-app',
            level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),

            // Configuración de formato según entorno
            ...(isDevelopment && {
                transport: {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'yyyy-mm-dd HH:MM:ss',
                        ignore: 'pid,hostname',
                        messageFormat: '{context} {msg}',
                        levelFirst: false,
                        crlf: false
                    }
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
        });
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

    // Métodos especializados para el contexto de la aplicación
    logServerStart(config: { port: number; host: string; environment: string }) {
        this.info('🎉 Servidor iniciado exitosamente', {
            event: 'server_start',
            port: config.port,
            host: config.host,
            environment: config.environment,
            timestamp: new Date().toISOString(),
            url: `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`
        });
    }

    logPortCheck(port: number, host: string, isOccupied: boolean) {
        const level = isOccupied ? 'warn' : 'debug';
        const emoji = isOccupied ? '🔴' : '🟢';
        const status = isOccupied ? 'OCUPADO' : 'LIBRE';

        this[level](`${emoji} Puerto ${port} está ${status} en ${host}`, {
            event: 'port_check',
            port,
            host,
            occupied: isOccupied,
            status
        });
    }

    logConfigurationStart(config: any) {
        this.info('🚀 Iniciando configuración de aplicación', {
            event: 'app_configuration_start',
            nodeEnv: config.nodeEnv,
            environment: config.environment,
            port: config.port,
            host: config.host,
            timestamp: new Date().toISOString(),
            workingDirectory: process.cwd(),
            nodeVersion: process.version
        });
    }

    logBootstrapStart() {
        this.info('🏁 Iniciando bootstrap de la aplicación', {
            event: 'bootstrap_start',
            timestamp: new Date().toISOString()
        });
    }

    logMiddlewareSetup(middleware: string, success: boolean, error?: any) {
        if (success) {
            this.info(`✅ ${middleware} configurado exitosamente`, {
                event: 'middleware_setup',
                middleware,
                success: true
            });
        } else {
            this.warn(`⚠️ No se pudo configurar ${middleware}`, {
                event: 'middleware_setup',
                middleware,
                success: false,
                error: error?.message
            });
        }
    }

    logCorsSetup(origins: string[], environment: string) {
        this.info(`🌐 CORS configurado para ${origins.length} orígenes`, {
            event: 'cors_setup',
            originsCount: origins.length,
            origins,
            environment
        });
    }

    logSignalReceived(signal: string, config: any) {
        this.info(`📴 Señal ${signal} recibida - cerrando aplicación`, {
            event: 'signal_received',
            signal,
            port: config.port,
            host: config.host,
            environment: config.environment,
            timestamp: new Date().toISOString()
        });
    }

    logFatalError(error: any, context?: string, additionalInfo?: any) {
        this.fatal('💥 Error fatal en la aplicación', error, {
            event: 'fatal_error',
            context: context || this.context,
            timestamp: new Date().toISOString(),
            additionalInfo
        });
    }

    logPortUsageHelp(port: number) {
        this.error(`❌ Puerto ${port} ya está en uso - comandos para liberar:`, null, {
            event: 'port_usage_help',
            port,
            commands: [
                `npx kill-port ${port}`,
                `lsof -ti:${port} | xargs kill -9`,
                `netstat -tulpn | grep :${port}`
            ]
        });
    }

    // Crear logger hijo con contexto específico
    child(context: string): LoggerService {
        return new LoggerService(context);
    }

    // Obtener el logger nativo de Pino para casos especiales
    getRawLogger(): pino.Logger {
        return this.logger;
    }
}