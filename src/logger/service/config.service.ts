import { Injectable } from "@nestjs/common";
import { HttpTransportService } from "./http-transport.service";
import { LoggerConfig } from "../interfaces/logger.interface";

@Injectable()
export class LoggerConfigService {
    constructor(private readonly httpTransport: HttpTransportService) { }

    // Método para obtener la configuración actual
    getConfig(): LoggerConfig {
        const config = this.httpTransport.config;
        return {
            logEndpoint: config.logEndpoint, // Corregido: usar logEndpoint
            httpTransportEnabled: config.httpTransportEnabled,
            httpTransportLevel: config.httpTransportLevel as "trace" | "debug" | "info" | "warn" | "error" | "fatal", // Agregado 'trace'
            timeout: config.timeout,
            retryAttempts: config.retryAttempts, // Agregado
            retryDelay: config.retryDelay, // Agregado
            enabledLevels: config.enabledLevels, // Agregado
            batchSize: config.batchSize, // Agregado
            flushInterval: config.flushInterval // Agregado
        };
    }

    // Método para cambiar el endpoint de logs dinámicamente
    setLogEndpoint(endpoint: string): void {
        this.httpTransport.config.logEndpoint = endpoint;
        console.log(`[LoggerConfigService] Endpoint actualizado a: ${endpoint}`);
    }

    // Método para habilitar/deshabilitar HTTP transport
    setHttpTransportEnabled(enabled: boolean): void {
        this.httpTransport.config.httpTransportEnabled = enabled;
        console.log(`[LoggerConfigService] HTTP Transport ${enabled ? 'habilitado' : 'deshabilitado'}`);
    }

    // Método para cambiar el nivel de transporte HTTP
    setHttpTransportLevel(level: "trace" | "debug" | "info" | "warn" | "error" | "fatal"): void {
        this.httpTransport.config.httpTransportLevel = level;
        console.log(`[LoggerConfigService] Nivel de HTTP Transport actualizado a: ${level}`);
    }

    // Método para cambiar los niveles habilitados
    setEnabledLevels(levels: string[]): void {
        this.httpTransport.setEnabledLevels(levels);
        console.log(`[LoggerConfigService] Niveles habilitados actualizados: [${levels.join(', ')}]`);
    }

    // Método para cambiar el tamaño del lote
    setBatchSize(size: number): void {
        this.httpTransport.config.batchSize = size;
        console.log(`[LoggerConfigService] Tamaño de lote actualizado a: ${size}`);
    }

    // Método para cambiar el intervalo de flush
    setFlushInterval(interval: number): void {
        this.httpTransport.config.flushInterval = interval;
        console.log(`[LoggerConfigService] Intervalo de flush actualizado a: ${interval}ms`);
    }

    // Método para cambiar timeout
    setTimeout(timeout: number): void {
        this.httpTransport.config.timeout = timeout;
        console.log(`[LoggerConfigService] Timeout actualizado a: ${timeout}ms`);
    }

    // Método para cambiar configuración de reintentos
    setRetryConfig(attempts: number, delay: number): void {
        this.httpTransport.config.retryAttempts = attempts;
        this.httpTransport.config.retryDelay = delay;
        console.log(`[LoggerConfigService] Configuración de reintentos actualizada: ${attempts} intentos, ${delay}ms delay`);
    }

    // Método para obtener estadísticas completas
    getStats(): any {
        return {
            config: this.getConfig(),
            queueStats: this.httpTransport.getQueueStats(),
            transportStats: this.httpTransport.getStats()
        };
    }

    // Método para probar la conectividad
    async testConnection(): Promise<boolean> {
        return await this.httpTransport.testConnection();
    }

    // Método para forzar el envío de logs pendientes
    async flushPendingLogs(): Promise<void> {
        await this.httpTransport.forceFlush();
    }

    // Método para actualizar múltiples configuraciones a la vez
    updateConfig(partialConfig: Partial<LoggerConfig>): void {
        const config = this.httpTransport.config;

        if (partialConfig.logEndpoint !== undefined) {
            config.logEndpoint = partialConfig.logEndpoint;
        }
        if (partialConfig.httpTransportEnabled !== undefined) {
            config.httpTransportEnabled = partialConfig.httpTransportEnabled;
        }
        if (partialConfig.httpTransportLevel !== undefined) {
            config.httpTransportLevel = partialConfig.httpTransportLevel;
        }
        if (partialConfig.timeout !== undefined) {
            config.timeout = partialConfig.timeout;
        }
        if (partialConfig.retryAttempts !== undefined) {
            config.retryAttempts = partialConfig.retryAttempts;
        }
        if (partialConfig.retryDelay !== undefined) {
            config.retryDelay = partialConfig.retryDelay;
        }
        if (partialConfig.enabledLevels !== undefined) {
            this.httpTransport.setEnabledLevels(partialConfig.enabledLevels);
        }
        if (partialConfig.batchSize !== undefined) {
            config.batchSize = partialConfig.batchSize;
        }
        if (partialConfig.flushInterval !== undefined) {
            config.flushInterval = partialConfig.flushInterval;
        }

        console.log('[LoggerConfigService] Configuración actualizada:', partialConfig);
    }
}