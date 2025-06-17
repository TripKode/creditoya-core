export interface LoggerConfig {
    logEndpoint: string; // Corregido: errorEndpoint -> logEndpoint
    httpTransportEnabled: boolean;
    httpTransportLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'; // Agregado 'trace'
    timeout: number;
    retryAttempts: number; // Agregado
    retryDelay: number; // Agregado
    enabledLevels: string[]; // Agregado: niveles habilitados
    batchSize: number; // Agregado: tamaño de lote
    flushInterval: number; // Agregado: intervalo de flush
}

// Configuración por defecto para facilitar el uso
export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
    logEndpoint: 'http://localhost:3005/logs',
    httpTransportEnabled: true,
    httpTransportLevel: 'debug',
    timeout: 5000,
    retryAttempts: 3,
    retryDelay: 1000,
    enabledLevels: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
    batchSize: 10,
    flushInterval: 5000
};