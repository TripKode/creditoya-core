import { Transform } from 'stream';
import axios, { AxiosResponse } from 'axios';

interface HttpTransportOptions {
    endpoint?: string;
    level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    timeout?: number;
    retries?: number;
}

interface LogData {
    level: string;
    msg?: string;
    message?: string;
    context?: string;
    error?: any;
    pid?: number;
    hostname?: string;
    timestamp?: string;
    [key: string]: any;
}

export class HttpTransport extends Transform {
    private readonly endpoint: string;
    private readonly minimumLevel: number;
    private readonly timeout: number;
    private readonly retries: number;

    private readonly logLevels = {
        'debug': 20,
        'info': 30,
        'warn': 40,
        'error': 50,
        'fatal': 60
    };

    constructor(options: HttpTransportOptions = {}) {
        super({ objectMode: true });

        this.endpoint = options.endpoint || process.env.ERROR_ENDPOINT || 'http://localhost:3005/errors';
        this.minimumLevel = this.logLevels[options.level || 'error'] || 50;
        this.timeout = options.timeout || parseInt(process.env.HTTP_TRANSPORT_TIMEOUT || '5000');
        this.retries = options.retries || 2;
    }

    _transform(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null, data?: any) => void) {
        try {
            const logData: LogData = JSON.parse(chunk.toString());

            // Solo enviar logs del nivel especificado o superior
            const currentLevel = this.logLevels[logData.level as keyof typeof this.logLevels] || 30;

            if (currentLevel >= this.minimumLevel) {
                this.sendToEndpoint(logData).catch(error => {
                    // Log del error pero no hacer crash
                    console.error('[HttpTransport] Error sending log:', error.message);
                });
            }

            // Continuar con el pipeline normal
            callback(null, chunk);
        } catch (error) {
            // Si hay error parseando, continuar
            callback(null, chunk);
        }
    }

    private async sendToEndpoint(logData: LogData): Promise<void> {
        const payload = {
            timestamp: logData.timestamp || new Date().toISOString(),
            service: 'core-creditoya',
            environment: process.env.NODE_ENV || 'development',
            // level: logData.level, // Removed to avoid duplicate key with ...logData
            message: logData.msg || logData.message,
            context: logData.context,
            error: logData.error,
            stack: logData.error?.stack,
            pid: logData.pid,
            hostname: logData.hostname,
            ...logData
        };

        let lastError: Error;

        for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
            try {
                const response: AxiosResponse = await axios.post(this.endpoint, payload, {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'NestJS-Logger-Transport'
                    }
                });

                // Si llegamos aquí, fue exitoso
                return;
            } catch (error: any) {
                lastError = error;

                if (attempt <= this.retries) {
                    // Esperar antes del retry (exponential backoff)
                    await this.delay(Math.pow(2, attempt - 1) * 1000);
                }
            }
        }

        // Si llegamos aquí, todos los intentos fallaron
        throw lastError!;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Factory function para crear el transport
export function createHttpTransport(options?: HttpTransportOptions): HttpTransport {
    return new HttpTransport(options);
}