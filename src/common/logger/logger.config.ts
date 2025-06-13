export interface LoggerConfig {
    errorEndpoint: string;
    httpTransportEnabled: boolean;
    httpTransportLevel: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    timeout: number;
}

export const getLoggerConfig = (): LoggerConfig => {
    return {
        errorEndpoint: process.env.ERROR_ENDPOINT || 'http://localhost:3005/errors',
        httpTransportEnabled: process.env.HTTP_TRANSPORT_ENABLED !== 'false', // Habilitado por defecto
        httpTransportLevel: (process.env.HTTP_TRANSPORT_LEVEL as any) || 'error',
        timeout: parseInt(process.env.HTTP_TRANSPORT_TIMEOUT || '5000')
    };
};