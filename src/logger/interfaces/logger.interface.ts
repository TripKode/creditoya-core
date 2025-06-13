export interface LoggerConfig {
    errorEndpoint: string;
    httpTransportEnabled: boolean;
    httpTransportLevel: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    timeout: number;
}