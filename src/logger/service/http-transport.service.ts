import { Injectable } from '@nestjs/common';
import pino from 'pino';
import axios from 'axios';

export interface HttpTransportConfig {
    httpTransportEnabled: boolean;
    logEndpoint: string; // Cambio de errorEndpoint a logEndpoint
    httpTransportLevel: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
    enabledLevels: string[]; // Nuevos niveles habilitados
    batchSize: number; // Para envío por lotes
    flushInterval: number; // Intervalo de envío
}

@Injectable()
export class HttpTransportService {
    public readonly config: HttpTransportConfig;
    private logQueue: any[] = []; // Cola para logs por lotes
    private flushTimer: NodeJS.Timeout | null = null;

    constructor() {
        this.config = {
            httpTransportEnabled: process.env.HTTP_TRANSPORT_ENABLED === 'true' || true,
            logEndpoint: process.env.LOG_ENDPOINT || 'http://localhost:3005/logs', // Endpoint genérico para logs
            httpTransportLevel: process.env.HTTP_TRANSPORT_LEVEL || 'debug',
            timeout: parseInt(process.env.HTTP_TRANSPORT_TIMEOUT || '5000'),
            retryAttempts: parseInt(process.env.HTTP_TRANSPORT_RETRY_ATTEMPTS || '3'),
            retryDelay: parseInt(process.env.HTTP_TRANSPORT_RETRY_DELAY || '1000'),
            enabledLevels: (process.env.HTTP_TRANSPORT_LEVELS || 'trace,debug,info,warn,error,fatal').split(','),
            batchSize: parseInt(process.env.HTTP_TRANSPORT_BATCH_SIZE || '10'),
            flushInterval: parseInt(process.env.HTTP_TRANSPORT_FLUSH_INTERVAL || '5000')
        };

        console.log('[HttpTransportService] Configuración cargada:', {
            enabled: this.config.httpTransportEnabled,
            endpoint: this.config.logEndpoint,
            level: this.config.httpTransportLevel,
            enabledLevels: this.config.enabledLevels,
            timeout: this.config.timeout,
            batchSize: this.config.batchSize,
            flushInterval: this.config.flushInterval
        });

        // Iniciar timer para flush automático
        this.startFlushTimer();
    }

    createHttpStream(): pino.DestinationStream {
        if (!this.config.httpTransportEnabled) {
            console.log('[HttpTransportService] HTTP Transport deshabilitado');
            return pino.destination({ dest: '/dev/null' });
        }

        return pino.destination({
            write: (data: string) => {
                this.queueLog(data).catch(error => {
                    console.error('[HttpTransportService] Error procesando log:', error.message);
                });
            },
            sync: false
        });
    }

    private async queueLog(logData: string): Promise<void> {
        try {
            // Parsear el log data
            let logObject;
            try {
                logObject = JSON.parse(logData);
            } catch (parseError) {
                logObject = {
                    level: 'info',
                    message: logData.trim(),
                    timestamp: new Date().toISOString(),
                    service: 'core-creditoya',
                    parseError: true
                };
            }

            // Verificar si el nivel está habilitado
            const logLevel = logObject.level || 'info';
            if (!this.config.enabledLevels.includes(logLevel)) {
                return; // Skip logs que no están en los niveles habilitados
            }

            // Preparar payload para el endpoint
            const payload = this.prepareLogPayload(logObject);

            // Agregar a la cola
            this.logQueue.push(payload);

            // Si la cola alcanza el tamaño del lote, enviar inmediatamente
            if (this.logQueue.length >= this.config.batchSize) {
                await this.flushLogs();
            }

        } catch (error) {
            console.error('[HttpTransportService] Error agregando log a la cola:', error.message);
        }
    }

    private prepareLogPayload(logObject: any): any {
        return {
            timestamp: logObject.timestamp || new Date().toISOString(),
            level: logObject.level || 'info',
            message: logObject.msg || logObject.message || 'Sin mensaje',
            context: logObject.context || 'Unknown',
            service: logObject.service || 'core-creditoya',
            environment: logObject.environment || process.env.NODE_ENV || 'development',
            pid: logObject.pid || process.pid,
            hostname: logObject.hostname || require('os').hostname(),

            // Incluir metadata adicional si existe
            ...(logObject.error && { error: logObject.error }),
            ...(logObject.event && { event: logObject.event }),
            ...(logObject.meta && { meta: logObject.meta }),
            ...(logObject.stack && { stack: logObject.stack }),
            ...(logObject.req && { request: logObject.req }),
            ...(logObject.res && { response: logObject.res }),

            // Agregar cualquier campo personalizado
            ...Object.keys(logObject).reduce((acc, key) => {
                const excludedFields = [
                    'timestamp', 'level', 'msg', 'message', 'context', 'service',
                    'environment', 'pid', 'hostname', 'error', 'event', 'meta',
                    'stack', 'req', 'res'
                ];

                if (!excludedFields.includes(key)) {
                    acc[key] = logObject[key];
                }
                return acc;
            }, {} as any)
        };
    }

    private async flushLogs(): Promise<void> {
        if (this.logQueue.length === 0) return;

        const logsToSend = [...this.logQueue];
        this.logQueue = []; // Limpiar la cola

        await this.sendLogsToEndpoint(logsToSend);
    }

    private async sendLogsToEndpoint(logs: any[], attempt: number = 1): Promise<void> {
        try {
            const payload = {
                logs,
                batch: {
                    size: logs.length,
                    timestamp: new Date().toISOString(),
                    attempt,
                    maxAttempts: this.config.retryAttempts
                },
                service: 'core-creditoya',
                environment: process.env.NODE_ENV || 'development'
            };

            const response = await axios.post(this.config.logEndpoint, payload, {
                timeout: this.config.timeout,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'NestJS-Logger-Transport/1.0',
                    'X-Log-Count': logs.length.toString(),
                    'X-Service': 'core-creditoya',
                    'X-Batch-Id': `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                }
            });

            // Log exitoso solo en desarrollo para logs de nivel debug/trace
            if (process.env.NODE_ENV === 'development') {
                const levels = logs.map(log => log.level).join(', ');
                console.log(`[HttpTransportService] Lote de ${logs.length} logs enviado exitosamente. Niveles: [${levels}]`);
            }

        } catch (error) {
            // Reintentar si no hemos alcanzado el máximo de intentos
            if (attempt < this.config.retryAttempts) {
                await this.delay(this.config.retryDelay * attempt);
                return this.sendLogsToEndpoint(logs, attempt + 1);
            }

            // Log de error final
            console.error(`[HttpTransportService] Error final enviando lote después de ${attempt} intentos:`, {
                error: error.message,
                endpoint: this.config.logEndpoint,
                timeout: this.config.timeout,
                batchSize: logs.length,
                levels: logs.map(log => log.level)
            });

            // Re-agregar logs a la cola para el siguiente intento (opcional)
            // this.logQueue.unshift(...logs);
        }
    }

    private startFlushTimer(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        this.flushTimer = setInterval(async () => {
            if (this.logQueue.length > 0) {
                await this.flushLogs();
            }
        }, this.config.flushInterval);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Método para probar la conectividad con diferentes niveles
    async testConnection(): Promise<boolean> {
        try {
            const testLogs = [
                {
                    timestamp: new Date().toISOString(),
                    level: 'info',
                    message: 'Test de conectividad HTTP Transport - INFO',
                    context: 'HttpTransportService',
                    service: 'core-creditoya',
                    environment: process.env.NODE_ENV || 'development',
                    test: true,
                    testType: 'connectivity'
                },
                {
                    timestamp: new Date().toISOString(),
                    level: 'debug',
                    message: 'Test de conectividad HTTP Transport - DEBUG',
                    context: 'HttpTransportService',
                    service: 'core-creditoya',
                    environment: process.env.NODE_ENV || 'development',
                    test: true,
                    testType: 'connectivity'
                }
            ];

            const payload = {
                logs: testLogs,
                batch: {
                    size: testLogs.length,
                    timestamp: new Date().toISOString(),
                    test: true
                },
                service: 'core-creditoya',
                environment: process.env.NODE_ENV || 'development'
            };

            await axios.post(this.config.logEndpoint, payload, {
                timeout: this.config.timeout,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'NestJS-Logger-Transport/1.0',
                    'X-Test': 'true'
                }
            });

            console.log('[HttpTransportService] Test de conectividad exitoso');
            return true;
        } catch (error) {
            console.error('[HttpTransportService] Test de conectividad falló:', error.message);
            return false;
        }
    }

    // Método para obtener estadísticas
    getStats(): HttpTransportConfig & { queueSize: number } {
        return {
            ...this.config,
            queueSize: this.logQueue.length
        };
    }

    // Método para enviar log manual
    async sendManualLog(level: string, message: string, context?: string, meta?: any): Promise<void> {
        const logData = JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            msg: message,
            context: context || 'Manual',
            service: 'core-creditoya',
            environment: process.env.NODE_ENV || 'development',
            ...meta
        });

        await this.queueLog(logData);
    }

    // Método para forzar el envío de logs pendientes
    async forceFlush(): Promise<void> {
        await this.flushLogs();
    }

    // Método para limpiar recursos al destruir el servicio
    onDestroy(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        // Enviar logs pendientes antes de destruir
        if (this.logQueue.length > 0) {
            this.flushLogs().catch(error => {
                console.error('[HttpTransportService] Error enviando logs pendientes:', error.message);
            });
        }
    }

    // Método para configurar niveles dinámicamente
    setEnabledLevels(levels: string[]): void {
        this.config.enabledLevels = levels;
        console.log('[HttpTransportService] Niveles actualizados:', levels);
    }

    // Método para obtener estadísticas de la cola
    getQueueStats(): { size: number; levels: { [key: string]: number } } {
        const levelCounts = this.logQueue.reduce((acc, log) => {
            acc[log.level] = (acc[log.level] || 0) + 1;
            return acc;
        }, {} as { [key: string]: number });

        return {
            size: this.logQueue.length,
            levels: levelCounts
        };
    }
}