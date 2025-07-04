import { Injectable } from '@nestjs/common';
import pino from 'pino';
import axios from 'axios';

export interface HttpTransportConfig {
    httpTransportEnabled: boolean;
    logEndpoint: string;
    httpTransportLevel: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
    enabledLevels: string[];
    batchSize: number;
    flushInterval: number;
}

@Injectable()
export class HttpTransportService {
    public readonly config: HttpTransportConfig;
    private logQueue: any[] = [];
    private flushTimer: NodeJS.Timeout | null = null;

    constructor() {
        this.config = {
            httpTransportEnabled: process.env.HTTP_TRANSPORT_ENABLED === 'true' || true,
            logEndpoint: process.env.LOG_ENDPOINT || 'http://localhost:3005/logs',
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

        console.log('[HttpTransportService] Creando stream HTTP...');

        // Crear un stream personalizado que implemente la interfaz correcta
        const httpStream = {
            write: (chunk: string | Buffer, encoding?: string, callback?: (error?: Error | null) => void) => {
                const data = chunk.toString();

                this.queueLog(data).then(() => {
                    if (callback) callback();
                }).catch(error => {
                    console.error('[HttpTransportService] Error procesando log:', error.message);
                    if (callback) callback(error);
                });

                return true;
            },
            end: (callback?: () => void) => {
                this.flushLogs().then(() => {
                    if (callback) callback();
                }).catch(error => {
                    console.error('[HttpTransportService] Error en flush final:', error.message);
                    if (callback) callback();
                });
            }
        };

        return httpStream as any;
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
            const logLevel = this.getLogLevel(logObject);
            if (!this.config.enabledLevels.includes(logLevel)) {
                return; // Skip logs que no están en los niveles habilitados
            }

            // Preparar payload para el endpoint
            const payload = this.prepareLogPayload(logObject);

            // Agregar a la cola
            this.logQueue.push(payload);

            console.log(`[HttpTransportService] Log agregado a cola: ${logLevel} - ${payload.message?.substring(0, 50)}...`);

            // Si la cola alcanza el tamaño del lote, enviar inmediatamente
            if (this.logQueue.length >= this.config.batchSize) {
                await this.flushLogs();
            }

        } catch (error) {
            console.error('[HttpTransportService] Error agregando log a la cola:', error.message);
        }
    }

    private getLogLevel(logObject: any): string {
        // Mapear números de nivel de pino a nombres
        const pinoLevels: { [key: number]: string } = {
            10: 'trace',
            20: 'debug',
            30: 'info',
            40: 'warn',
            50: 'error',
            60: 'fatal'
        };

        if (typeof logObject.level === 'number') {
            return pinoLevels[logObject.level] || 'info';
        }

        return logObject.level || 'info';
    }

    private prepareLogPayload(logObject: any): any {
        const logLevel = this.getLogLevel(logObject);

        return {
            timestamp: logObject.time || logObject.timestamp || new Date().toISOString(),
            level: logLevel,
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
                    'time', 'timestamp', 'level', 'msg', 'message', 'context', 'service',
                    'environment', 'pid', 'hostname', 'error', 'event', 'meta',
                    'stack', 'req', 'res', 'name', 'v'
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
        this.logQueue = [];

        console.log(`[HttpTransportService] Enviando lote de ${logsToSend.length} logs...`);
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

            console.log(`[HttpTransportService] Enviando a ${this.config.logEndpoint}:`, {
                logCount: logs.length,
                levels: logs.map(log => log.level),
                sample: logs[0]?.message?.substring(0, 50)
            });

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

            console.log(`[HttpTransportService] Lote de ${logs.length} logs enviado exitosamente. Status: ${response.status}`);

        } catch (error) {
            console.error(`[HttpTransportService] Error enviando lote (intento ${attempt}):`, {
                error: error.message,
                endpoint: this.config.logEndpoint,
                batchSize: logs.length,
                status: error.response?.status,
                statusText: error.response?.statusText
            });

            // Reintentar si no hemos alcanzado el máximo de intentos
            if (attempt < this.config.retryAttempts) {
                console.log(`[HttpTransportService] Reintentando en ${this.config.retryDelay * attempt}ms...`);
                await this.delay(this.config.retryDelay * attempt);
                return this.sendLogsToEndpoint(logs, attempt + 1);
            }

            // Log de error final
            console.error(`[HttpTransportService] Error final enviando lote después de ${attempt} intentos. Logs perdidos.`);
        }
    }

    private startFlushTimer(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        this.flushTimer = setInterval(async () => {
            if (this.logQueue.length > 0) {
                console.log(`[HttpTransportService] Flush automático: ${this.logQueue.length} logs en cola`);
                await this.flushLogs();
            }
        }, this.config.flushInterval);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Método para probar la conectividad
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