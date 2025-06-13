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
            ...config,
            httpTransportLevel: config.httpTransportLevel as "fatal" | "error" | "warn" | "info" | "debug"
        };
    }

    // Método para cambiar el endpoint de errores dinámicamente
    setErrorEndpoint(endpoint: string) {
        this.httpTransport.config.errorEndpoint = endpoint;
    }
}