// Este archivo puede ser eliminado o su contenido reducido significativamente
// si `src/main.ts` ahora maneja el proceso de bootstrap directamente.

// import { NestFactory } from '@nestjs/core'; // No necesario si main.ts lo hace
import { checkPortStatus } from './CheckPorts';
// import { AppModule } from 'src/app.module'; // No necesario si main.ts lo hace
import { LoggerService } from 'src/logger/logger.service';
// import { LoggerConfigService } from 'src/logger/service/config.service'; // No usado directamente
import { HttpTransportService } from 'src/logger/service/http-transport.service';
import { ApplicationLoggerService } from 'src/logger/service/application.service';

// Si alguna lógica de este archivo sigue siendo necesaria y no se puede mover a main.ts,
// podría refactorizarse en funciones de utilidad que main.ts pueda importar.

// Por ejemplo, la lógica de verificación de puertos podría mantenerse aquí si es compleja.

// Es importante asegurar que no haya duplicación de la creación de la app NestJS
// o de la configuración del logger global.

// Si `main.ts` ahora es el punto de entrada principal para el bootstrap,
// la función `bootstrap` en este archivo ya no debería ser llamada desde `main.ts`.

// Considerar si `checkPortStatus` y cualquier otra utilidad aquí son usadas
// en otros lugares o si pueden ser internalizadas o movidas.

// Ejemplo de cómo podría quedar si solo se conservan utilidades:

// export { checkPortStatus }; // Si checkPortStatus se usa en otros lugares.

// El resto del código original de bootstrap que crea la app NestJS,
// configura middlewares, CORS, etc., debería estar ahora en `src/main.ts`.

// Si este archivo ya no es necesario, se puede eliminar.
// Por ahora, lo dejaremos con comentarios para indicar su estado reducido.

// --- INICIO DEL CÓDIGO ORIGINAL COMENTADO PARA REVISIÓN ---
/*
const httpTransport = new HttpTransportService()
// Crear instancia del logger para bootstrap
const bootstrapLogger = new LoggerService(httpTransport);
const applicationLog = new ApplicationLoggerService(bootstrapLogger, httpTransport);

export async function bootstrap() {
  try {
    // Logging estructurado con LoggerService
    bootstrapLogger.info('🚀 Iniciando aplicación NestJS', {
      event: 'bootstrap_start',
      timestamp: new Date().toISOString(),
      workingDirectory: process.cwd(),
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV || 'undefined',
      portEnv: process.env.PORT || 'undefined'
    });

    // Mantener logs de consola para compatibilidad visual
    // ESTOS CONSOLE.LOGS DEBERÍAN SER REEMPLAZADOS POR EL LOGGERSERVICE EN MAIN.TS
    console.log('🚀 === DEBUG: Iniciando aplicación NestJS ===');
    // ... (más console.logs) ...

    // CONFIGURACIÓN DINÁMICA SEGÚN ENTORNO
    // ESTA LÓGICA DEBERÍA ESTAR EN MAIN.TS
    const isProduction = process.env.NODE_ENV === 'production';
    const port = isProduction ? 8080 : 3000;
    const host = isProduction ? '0.0.0.0' : '127.0.0.1';
    // ... (más lógica de config) ...

    // VERIFICAR ESTADO DEL PUERTO ANTES DE CREAR LA APP
    // ESTA LÓGICA PODRÍA SER UNA UTILIDAD LLAMADA DESDE MAIN.TS
    const isPortOccupied = await checkPortStatus(port, host);
    // ... (más lógica de verificación de puerto) ...

    // CREANDO APLICACIÓN NESTJS
    // ESTO ES RESPONSABILIDAD DE MAIN.TS AHORA
    // const app = await NestFactory.create(AppModule);

    // CONFIGURAR EL LOGGER GLOBAL DE LA APLICACIÓN
    // ESTO ES RESPONSABILIDAD DE MAIN.TS AHORA
    // const appLogger = app.get(LoggerService);
    // app.useLogger(appLogger);

    // MIDDLEWARES, CORS, COOKIE PARSER
    // ESTO ES RESPONSABILIDAD DE MAIN.TS AHORA
    // ...

    // INICIAR SERVIDOR
    // ESTO ES RESPONSABILIDAD DE MAIN.TS AHORA
    // await app.listen(port, host);

    // MANEJO DE SEÑALES
    // ESTO ES RESPONSABILIDAD DE MAIN.TS AHORA
    // process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    // process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    // MANEJO DE ERRORES DE BOOTSTRAP
    // ESTO ES RESPONSABILIDAD DE MAIN.TS AHORA
    // ...
    process.exit(1);
  }
}
*/
// --- FIN DEL CÓDIGO ORIGINAL COMENTADO ---

// Si `checkPortStatus` es la única utilidad que se mantiene:
export { checkPortStatus };

// Se podría considerar crear un `bootstrap.utils.ts` si hay más utilidades.
// O mover `checkPortStatus` a una carpeta de utilidades más general si aplica.