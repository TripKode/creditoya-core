import { Injectable } from "@nestjs/common";
import { LoggerService } from "../logger.service";
import { HttpTransportService } from "./http-transport.service";

@Injectable()
export class ApplicationLoggerService {
    constructor(
        private readonly loggerCore: LoggerService,
        private readonly httpService: HttpTransportService
    ) { }

    // Métodos especializados para el contexto de la aplicación
    logServerStart(config: { port: number; host: string; environment: string }) {
        this.loggerCore.info('🎉 Servidor iniciado exitosamente', {
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

        this.loggerCore[level](`${emoji} Puerto ${port} está ${status} en ${host}`, {
            event: 'port_check',
            port,
            host,
            occupied: isOccupied,
            status
        });
    }

    logConfigurationStart(config: any) {
        this.loggerCore.info('🚀 Iniciando configuración de aplicación', {
            event: 'app_configuration_start',
            nodeEnv: config.nodeEnv,
            environment: config.environment,
            port: config.port,
            host: config.host,
            timestamp: new Date().toISOString(),
            workingDirectory: process.cwd(),
            nodeVersion: process.version,
            httpTransportEnabled: this.httpService.config.httpTransportEnabled,
            httpTransportEndpoint: this.httpService.config.errorEndpoint
        });
    }

    logBootstrapStart() {
        this.loggerCore.info('🏁 Iniciando bootstrap de la aplicación', {
            event: 'bootstrap_start',
            timestamp: new Date().toISOString()
        });
    }

    logMiddlewareSetup(middleware: string, success: boolean, error?: any) {
        if (success) {
            this.loggerCore.info(`✅ ${middleware} configurado exitosamente`, {
                event: 'middleware_setup',
                middleware,
                success: true
            });
        } else {
            this.loggerCore.warn(`⚠️ No se pudo configurar ${middleware}`, {
                event: 'middleware_setup',
                middleware,
                success: false,
                error: error?.message
            });
        }
    }

    logCorsSetup(origins: string[], environment: string) {
        this.loggerCore.info(`🌐 CORS configurado para ${origins.length} orígenes`, {
            event: 'cors_setup',
            originsCount: origins.length,
            origins,
            environment
        });
    }

    logSignalReceived(signal: string, config: any) {
        this.loggerCore.info(`📴 Señal ${signal} recibida - cerrando aplicación`, {
            event: 'signal_received',
            signal,
            port: config.port,
            host: config.host,
            environment: config.environment,
            timestamp: new Date().toISOString()
        });
    }

    logFatalError(error: any, context?: string, additionalInfo?: any) {
        this.loggerCore.fatal('💥 Error fatal en la aplicación', error, {
            event: 'fatal_error',
            context: context || this.loggerCore.context,
            timestamp: new Date().toISOString(),
            additionalInfo
        });
    }

    logPortUsageHelp(port: number) {
        this.loggerCore.error(`❌ Puerto ${port} ya está en uso - comandos para liberar:`, null, {
            event: 'port_usage_help',
            port,
            commands: [
                `npx kill-port ${port}`,
                `lsof -ti:${port} | xargs kill -9`,
                `netstat -tulpn | grep :${port}`
            ]
        });
    }
}