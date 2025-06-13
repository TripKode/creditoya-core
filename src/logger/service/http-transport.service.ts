import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { Transform } from 'stream';

interface LoggerConfig {
    errorEndpoint: string;
    httpTransportEnabled: boolean;
    httpTransportLevel: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
}

@Injectable()
export class HttpTransportService {
    public readonly config: LoggerConfig;

    constructor() {
        // Configuración del logger con más opciones
        this.config = {
            errorEndpoint: process.env.ERROR_ENDPOINT || 'http://localhost:3005/errors',
            httpTransportEnabled: process.env.HTTP_TRANSPORT_ENABLED !== 'false',
            httpTransportLevel: (process.env.HTTP_TRANSPORT_LEVEL as any) || 'error',
            timeout: parseInt(process.env.HTTP_TRANSPORT_TIMEOUT || '10000'), // Aumentado timeout
            retryAttempts: parseInt(process.env.HTTP_TRANSPORT_RETRY_ATTEMPTS || '3'),
            retryDelay: parseInt(process.env.HTTP_TRANSPORT_RETRY_DELAY || '2000')
        };
    }

    // Crear stream personalizado para envío HTTP - MEJORADO
    createHttpStream(): Transform {
        const logLevels = {
            'debug': 20,
            'info': 30,
            'warn': 40,
            'error': 50,
            'fatal': 60
        };

        const minimumLevel = logLevels[this.config.httpTransportLevel] || 50;

        return new Transform({
            objectMode: true,
            transform: (chunk, encoding, callback) => {
                try {
                    // Parsear el chunk como string o objeto
                    let logData;
                    if (typeof chunk === 'string') {
                        logData = JSON.parse(chunk);
                    } else if (Buffer.isBuffer(chunk)) {
                        logData = JSON.parse(chunk.toString());
                    } else {
                        logData = chunk;
                    }

                    // Verificar si el log cumple con el nivel mínimo
                    const currentLevel = logLevels[logData.level as keyof typeof logLevels] || 30;

                    if (currentLevel >= minimumLevel) {
                        console.log(`[LoggerService] Enviando log al HTTP endpoint: ${logData.level} - ${logData.msg || logData.message}`);

                        // Enviar de forma asíncrona sin bloquear el stream
                        setImmediate(() => {
                            this.sendLogToEndpoint(logData).catch(error => {
                                console.error('[HttpTransport] Failed to send log:', error.message);
                                console.error('[HttpTransport] Log data was:', JSON.stringify(logData, null, 2));
                            });
                        });
                    }
                } catch (error) {
                    console.error('[HttpTransport] Error processing log chunk:', error);
                    console.error('[HttpTransport] Chunk was:', chunk);
                }

                // Siempre llamar callback para continuar el stream
                callback(null, chunk);
            }
        });
    }

    // Enviar log al endpoint HTTP - MEJORADO con reintentos
    private async sendLogToEndpoint(logData: any): Promise<void> {
        const payload = {
            timestamp: logData.time || new Date().toISOString(),
            service: logData.service || 'core-creditoya',
            environment: logData.environment || process.env.NODE_ENV || 'development',
            level: logData.level,
            message: logData.msg || logData.message,
            context: logData.context,
            error: logData.error ? {
                name: logData.error.name,
                message: logData.error.message,
                stack: logData.error.stack,
                code: logData.error.code
            } : undefined,
            stack: logData.error?.stack || logData.stack,
            pid: logData.pid,
            hostname: logData.hostname,
            event: logData.event,
            port: logData.port,
            host: logData.host,
            url: logData.url,
            // Incluir todos los campos adicionales
            ...logData
        };

        // Función de reintento
        const attemptSend = async (attempt: number): Promise<void> => {
            try {
                console.log(`[HttpTransport] Enviando al endpoint (intento ${attempt}/${this.config.retryAttempts + 1}):`, this.config.errorEndpoint);

                const response = await axios.post(this.config.errorEndpoint, payload, {
                    timeout: this.config.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'NestJS-Logger-HTTP-Transport',
                        'Accept': 'application/json'
                    },
                    // Configuraciones adicionales para mejorar la conexión
                    maxRedirects: 5,
                    validateStatus: (status) => status >= 200 && status < 300
                });

                console.log(`[HttpTransport] Log enviado exitosamente. Status: ${response.status}`);
                console.log(`[HttpTransport] Response:`, response.data);

            } catch (error: any) {
                console.error(`[HttpTransport] Error en intento ${attempt}:`, {
                    message: error.message,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data,
                    config: {
                        url: error.config?.url,
                        method: error.config?.method,
                        timeout: error.config?.timeout
                    }
                });

                // Si no es el último intento, intentar de nuevo
                if (attempt < this.config.retryAttempts + 1) {
                    console.log(`[HttpTransport] Reintentando en ${this.config.retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                    return attemptSend(attempt + 1);
                } else {
                    console.error(`[HttpTransport] Todos los intentos fallaron para el log:`, payload);
                    throw error;
                }
            }
        };

        // Iniciar el proceso de envío
        try {
            await attemptSend(1);
        } catch (finalError) {
            // Log final del error pero no lanzar excepción para evitar afectar la aplicación
            console.error('[HttpTransport] Error final enviando log después de todos los reintentos:', finalError);
        }
    }

    // Método para testear la conexión HTTP
    async testHttpTransport(): Promise<boolean> {
        try {
            console.log('[LoggerService] Testeando conexión HTTP Transport...');

            const testPayload = {
                timestamp: new Date().toISOString(),
                service: 'core-creditoya',
                environment: process.env.NODE_ENV || 'development',
                level: 'info',
                message: 'Test de conexión HTTP Transport',
                context: 'LoggerService',
                event: 'http_transport_test'
            };

            const response = await axios.post(this.config.errorEndpoint, testPayload, {
                timeout: this.config.timeout,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'NestJS-Logger-HTTP-Transport-Test'
                }
            });

            console.log('[LoggerService] Test HTTP Transport exitoso:', response.status, response.data);
            return true;

        } catch (error: any) {
            console.error('[LoggerService] Test HTTP Transport falló:', {
                message: error.message,
                code: error.code,
                status: error.response?.status,
                endpoint: this.config.errorEndpoint
            });
            return false;
        }
    }
}