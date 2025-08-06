import { Injectable, ConsoleLogger, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

// Interfaces que coinciden con el servidor externo
interface LogEntry {
    id?: string;
    timestamp?: Date;
    level: string; // error, warn, info, debug, fatal
    message: string;
    source: string; // identificador de la aplicación
    metadata?: any; // datos adicionales del log (JSON)
    traceId?: string; // para tracking distribuido
    userId?: string; // usuario relacionado al log
    sessionId?: string; // sesión relacionada
    environment?: string; // dev, staging, prod
    service?: string; // microservicio específico
    version?: string; // versión de la app
    host?: string; // servidor/host origen
    indexed?: boolean; // para marcar logs importantes
    archived?: boolean; // para archivado
    processed?: boolean; // para procesamiento
    createdAt?: Date;
    updatedAt?: Date;
    expiresAt?: Date; // para TTL automático
}

interface LogBatch {
    id?: string;
    batchId: string;
    source: string;
    totalLogs: number;
    processedLogs?: number;
    failedLogs?: number;
    status?: string; // processing, completed, failed
    startTime?: Date;
    endTime?: Date;
    processingTime?: number; // en milisegundos
    metadata?: any;
    createdAt?: Date;
    updatedAt?: Date;
}

@Injectable()
export class CustomLoggerService extends ConsoleLogger implements LoggerService {
    private logBuffer: LogEntry[] = [];
    private readonly batchSize: number;
    private readonly batchTimeout: number;
    private readonly maxRetries: number;
    private readonly retryDelay: number;
    private readonly logServerUrl: string;
    private readonly logServerToken?: string;
    private readonly environment: string;
    private readonly hostname: string;
    private readonly version: string;
    private readonly serviceName: string;
    private readonly sourceId: string;
    private readonly enableExternalLogging: boolean; // Nueva propiedad para controlar envío externo
    private batchTimer?: NodeJS.Timeout;
    private currentTraceId?: string;
    private currentUserId?: string;
    private currentSessionId?: string;

    constructor() {
        super('CustomLogger');

        // Configuración desde variables de entorno
        this.logServerUrl = process.env.LOG_SERVER_URL || 'http://localhost:3000/door/logs';
        this.logServerToken = process.env.LOG_SERVER_TOKEN;
        this.batchSize = Number(process.env.LOG_BATCH_SIZE) || 10;
        this.batchTimeout = Number(process.env.LOG_BATCH_TIMEOUT) || 5000;
        this.maxRetries = Number(process.env.LOG_MAX_RETRIES) || 3;
        this.retryDelay = Number(process.env.LOG_RETRY_DELAY) || 1000;

        // Información del entorno
        this.environment = process.env.NODE_ENV || 'development';
        this.hostname = require('os').hostname();
        this.version = process.env.npm_package_version || '0.0.1';
        this.serviceName = process.env.SERVICE_NAME || 'nestjs-app';
        this.sourceId = process.env.SOURCE_ID || `devs-core-creditoya-786bfgrt`;

        // Deshabilitar envío de logs al servidor externo en producción
        this.enableExternalLogging = this.environment !== 'production';

        // Log de configuración
        if (this.enableExternalLogging) {
            super.log('✅ Envío de logs al servidor externo habilitado', 'CustomLogger');
        } else {
            super.log('🚫 Envío de logs al servidor externo deshabilitado (PRODUCCIÓN)', 'CustomLogger');
        }

        // Solo iniciar el timer de batch si el logging externo está habilitado
        if (this.enableExternalLogging) {
            this.startBatchTimer();
        }
    }

    // Método para establecer contexto de tracking
    setTrackingContext(traceId?: string, userId?: string, sessionId?: string) {
        this.currentTraceId = traceId;
        this.currentUserId = userId;
        this.currentSessionId = sessionId;
    }

    // Método para limpiar contexto de tracking
    clearTrackingContext() {
        this.currentTraceId = undefined;
        this.currentUserId = undefined;
        this.currentSessionId = undefined;
    }

    private createLogEntry(level: string, message: string, context?: string, trace?: string, metadata?: any): LogEntry {
        const now = new Date();

        // Asegurar que el message sea string
        const messageStr = typeof message === 'string' ? message : JSON.stringify(message);

        const logEntry: LogEntry = {
            id: uuidv4(),
            timestamp: now,
            level,
            message: messageStr,
            source: this.sourceId,
            metadata: metadata || {},
            traceId: this.currentTraceId,
            userId: this.currentUserId,
            sessionId: this.currentSessionId,
            environment: this.environment,
            service: this.serviceName,
            version: this.version,
            host: this.hostname,
            indexed: level === 'error' || level === 'fatal', // Marcar errores como importantes
            archived: false,
            processed: false,
            createdAt: now,
            updatedAt: now
        };

        // Agregar contexto al metadata si existe
        if (context) {
            logEntry.metadata = { ...logEntry.metadata, context };
        }

        // Agregar trace al metadata si existe
        if (trace) {
            logEntry.metadata = { ...logEntry.metadata, trace };
        }

        // Establecer TTL (30 días por defecto)
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + 30);
        logEntry.expiresAt = expiresAt;

        return logEntry;
    }

    private createLogBatch(logs: LogEntry[]): LogBatch {
        const now = new Date();
        return {
            id: uuidv4(),
            batchId: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            source: this.sourceId,
            totalLogs: logs.length,
            processedLogs: 0,
            failedLogs: 0,
            status: 'processing',
            startTime: now,
            metadata: {
                environment: this.environment,
                service: this.serviceName,
                version: this.version,
                host: this.hostname
            },
            createdAt: now,
            updatedAt: now
        };
    }

    private startBatchTimer() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
        }

        this.batchTimer = setTimeout(() => {
            this.flushLogs();
        }, this.batchTimeout);
    }

    private async flushLogs() {
        // No hacer nada si el logging externo está deshabilitado
        if (!this.enableExternalLogging) {
            return;
        }

        if (this.logBuffer.length === 0) {
            this.startBatchTimer();
            return;
        }

        const logsToSend = this.logBuffer.splice(0, this.batchSize);

        // Validar que tenemos logs válidos antes de crear el batch
        if (!Array.isArray(logsToSend) || logsToSend.length === 0) {
            super.error('❌ Buffer de logs inválido o vacío', undefined, 'CustomLogger');
            this.startBatchTimer();
            return;
        }

        // Validar cada log individual
        const validLogs = logsToSend.filter(log => {
            if (!log || typeof log !== 'object') {
                super.error('❌ Log inválido encontrado (no es objeto)', undefined, 'CustomLogger');
                return false;
            }
            if (!log.message || !log.level) {
                super.error('❌ Log inválido encontrado (falta message o level)', undefined, 'CustomLogger');
                return false;
            }
            return true;
        });

        if (validLogs.length === 0) {
            super.error('❌ No hay logs válidos para enviar', undefined, 'CustomLogger');
            this.startBatchTimer();
            return;
        }

        const logBatch = this.createLogBatch(validLogs);

        try {
            await this.sendLogsToServer(logBatch, validLogs);
        } catch (error) {
            // Si falla el envío, volver a agregar los logs al buffer
            this.logBuffer.unshift(...validLogs);
            super.warn(`⚠️ Aviso: No se pudo enviar logs al servidor: ${error.message}`, 'CustomLogger');
        }

        this.startBatchTimer();
    }

    private async sendLogsToServer(batch: LogBatch, logs: LogEntry[], retryCount = 0): Promise<void> {
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (this.logServerToken) {
                headers['Authorization'] = `Bearer ${this.logServerToken}`;
            }

            // Validar que logs sea un array antes de enviar
            if (!Array.isArray(logs)) {
                throw new Error('Los logs no son un array válido');
            }

            // ESTRUCTURA CORREGIDA: Crear estructura compatible con ValidationService
            const requestBody = {
                batch: {
                    batchId: batch.batchId,
                    source: batch.source,
                    count: batch.totalLogs,
                    timestamp: batch.startTime,
                    metadata: batch.metadata,
                    // Propiedades adicionales que el servidor puede necesitar
                    totalLogs: logs.length,
                    processedLogs: 0,
                    failedLogs: 0,
                    status: 'pending',
                    startTime: new Date()
                },
                logs: logs
            };

            // Debug: Log de la estructura que se está enviando (solo en desarrollo)
            if (this.environment === 'development') {
                super.log(`📤 Enviando estructura corregida: batch=${JSON.stringify(requestBody.batch)}, logs.length=${logs.length}`, 'CustomLogger');
                super.log(`📤 Primer log: ${JSON.stringify(logs[0], null, 2)}`, 'CustomLogger');
            }

            const response = await fetch(this.logServerUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                super.error(`❌ Error del servidor: ${response.status} - ${errorText}`, undefined, 'CustomLogger');
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();

            // Log local exitoso (solo en desarrollo)
            if (this.environment === 'development') {
                super.log(`✅ Enviados ${logs.length} logs al servidor externo. RequestId: ${result.requestId || 'N/A'}`, 'CustomLogger');
            }

        } catch (error) {
            super.warn(`⚠️ Aviso: No se pudo enviar logs al servidor (intento ${retryCount + 1}/${this.maxRetries + 1}): ${error.message}`, 'CustomLogger');
            // super.error(`❌ Error enviando logs (intento ${retryCount + 1}/${this.maxRetries + 1}): ${error.message}`, error.stack, 'CustomLogger');

            if (retryCount < this.maxRetries) {
                const delay = this.retryDelay * Math.pow(2, retryCount); // Exponential backoff
                super.log(`🔄 Reintentando en ${delay}ms...`, 'CustomLogger');
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.sendLogsToServer(batch, logs, retryCount + 1);
            } else {
                throw error;
            }
        }
    }

    private addToBuffer(logEntry: LogEntry) {
        // Solo agregar al buffer si el logging externo está habilitado
        if (!this.enableExternalLogging) {
            return;
        }

        this.logBuffer.push(logEntry);

        // Si el buffer está lleno, enviar inmediatamente
        if (this.logBuffer.length >= this.batchSize) {
            this.flushLogs();
        }
    }

    log(message: any, context?: string) {
        super.log(message, context);
        const logEntry = this.createLogEntry('info', message, context);
        this.addToBuffer(logEntry);
    }

    error(message: any, trace?: string, context?: string) {
        super.error(message, trace, context);
        const logEntry = this.createLogEntry('error', message, context, trace);
        this.addToBuffer(logEntry);
    }

    warn(message: any, context?: string) {
        super.warn(message, context);
        const logEntry = this.createLogEntry('warn', message, context);
        this.addToBuffer(logEntry);
    }

    debug(message: any, context?: string) {
        super.debug(message, context);
        const logEntry = this.createLogEntry('debug', message, context);
        this.addToBuffer(logEntry);
    }

    verbose(message: any, context?: string) {
        super.verbose(message, context);
        const logEntry = this.createLogEntry('verbose', message, context);
        this.addToBuffer(logEntry);
    }

    // Método para logs fatales
    fatal(message: any, trace?: string, context?: string) {
        super.error(message, trace, context); // NestJS no tiene fatal, usar error
        const logEntry = this.createLogEntry('fatal', message, context, trace);
        this.addToBuffer(logEntry);
    }

    // Método para enviar logs con metadata adicional
    logWithMetadata(level: string, message: string, metadata?: any, context?: string) {
        const logEntry = this.createLogEntry(level, message, context, undefined, metadata);
        this.addToBuffer(logEntry);

        // También log local
        super.log(`[${level.toUpperCase()}] ${message}`, context);
    }

    // Método para logs con tracking completo
    logWithTracking(
        level: string,
        message: string,
        traceId?: string,
        userId?: string,
        sessionId?: string,
        metadata?: any,
        context?: string
    ) {
        const originalTraceId = this.currentTraceId;
        const originalUserId = this.currentUserId;
        const originalSessionId = this.currentSessionId;

        // Establecer contexto temporal
        this.setTrackingContext(traceId, userId, sessionId);

        // Crear y enviar log
        const logEntry = this.createLogEntry(level, message, context, undefined, metadata);
        this.addToBuffer(logEntry);

        // Restaurar contexto original
        this.setTrackingContext(originalTraceId, originalUserId, originalSessionId);

        // También log local
        super.log(`[${level.toUpperCase()}] ${message}`, context);
    }

    // Método para forzar el envío de logs pendientes
    async forceFlush(): Promise<void> {
        // No hacer nada si el logging externo está deshabilitado
        if (!this.enableExternalLogging) {
            return;
        }

        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
        }
        await this.flushLogs();
    }

    // Cleanup cuando se cierra la aplicación
    async onApplicationShutdown() {
        await this.forceFlush();
    }

    // Método para obtener estadísticas del buffer
    getBufferStats() {
        return {
            currentBufferSize: this.logBuffer.length,
            maxBufferSize: this.batchSize,
            bufferUtilization: (this.logBuffer.length / this.batchSize) * 100,
            externalLoggingEnabled: this.enableExternalLogging
        };
    }

    // Método para probar la conexión con el servidor
    async testConnection(): Promise<boolean> {
        // No hacer test si el logging externo está deshabilitado
        if (!this.enableExternalLogging) {
            super.log('🚫 Test de conexión omitido - logging externo deshabilitado', 'CustomLogger');
            return false;
        }

        try {
            const testLog = this.createLogEntry('info', 'Test de conexión', 'CustomLogger');
            const testBatch = this.createLogBatch([testLog]);

            super.log('🔧 Probando conexión con servidor externo...', 'CustomLogger');
            await this.sendLogsToServer(testBatch, [testLog]);
            super.log('✅ Conexión exitosa con servidor externo', 'CustomLogger');
            return true;
        } catch (error) {
            super.error(`❌ Error en test de conexión: ${error.message}`, error.stack, 'CustomLogger');
            return false;
        }
    }

    // Método para verificar si el logging externo está habilitado
    isExternalLoggingEnabled(): boolean {
        return this.enableExternalLogging;
    }

    // Método para debug - mostrar estructura del próximo envío
    debugNextBatch() {
        // No hacer debug si el logging externo está deshabilitado
        if (!this.enableExternalLogging) {
            super.log('🚫 Debug de batch omitido - logging externo deshabilitado', 'CustomLogger');
            return;
        }

        if (this.logBuffer.length === 0) {
            super.log('📋 Buffer vacío', 'CustomLogger');
            return;
        }

        const nextLogs = this.logBuffer.slice(0, Math.min(this.batchSize, this.logBuffer.length));
        const nextBatch = this.createLogBatch(nextLogs);

        super.log(`📋 Próximo batch a enviar:`, 'CustomLogger');
        super.log(`   - Batch ID: ${nextBatch.batchId}`, 'CustomLogger');
        super.log(`   - Source: ${nextBatch.source}`, 'CustomLogger');
        super.log(`   - Total logs: ${nextBatch.totalLogs}`, 'CustomLogger');
        super.log(`   - Primer log: ${JSON.stringify(nextLogs[0])}`, 'CustomLogger');
    }
}