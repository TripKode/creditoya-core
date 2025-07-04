import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggerService } from './logger/logger.service';
import { HttpTransportService } from './logger/service/http-transport.service';
import { ApplicationLoggerService } from './logger/service/application.service';

async function bootstrap() {
  // Inicializar servicios de logging primero
  const httpTransport = new HttpTransportService();
  const appLoggerInstance = new LoggerService(httpTransport);
  const applicationLog = new ApplicationLoggerService(appLoggerInstance, httpTransport);

  // Establecer contexto para el logger principal
  appLoggerInstance.setContext('MainApplication');

  // Función para obtener la configuración del puerto según entorno
  function getPortConfig() {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const isProduction = nodeEnv === 'production';

    return {
      port: isProduction ? 8080 : 3000,
      host: isProduction ? '0.0.0.0' : '127.0.0.1',
      environment: isProduction ? 'PRODUCTION' : 'DEVELOPMENT',
      nodeEnv: nodeEnv,
    };
  }

  const config = getPortConfig();

  try {
    // Log de configuración inicial usando ApplicationLoggerService
    applicationLog.logConfigurationStart(config);

    // Logs específicos por entorno
    if (config.nodeEnv === 'development') {
      appLoggerInstance.info('🔧 Ejecutando en modo desarrollo local', {
        event: 'development_mode',
        config,
      });
    } else if (config.nodeEnv === 'production') {
      appLoggerInstance.info('🚀 Ejecutando en modo producción', {
        event: 'production_mode',
        config,
      });
    } else {
      appLoggerInstance.warn(`⚠️ NODE_ENV personalizado: ${config.nodeEnv} (usando config de desarrollo)`, {
        event: 'custom_node_env',
        nodeEnv: config.nodeEnv,
        config,
      });
    }

    // Crear la aplicación NestJS
    const app = await NestFactory.create(AppModule, {
      // Usar nuestra instancia de LoggerService
      // El logger de NestFactory.create es solo para el proceso de bootstrap inicial
      // El logger de la aplicación se establece con app.useLogger()
      logger: false, // Deshabilitar el logger por defecto de NestJS durante el bootstrap si queremos control total
    });

    // Establecer nuestro LoggerService como el logger global de la aplicación
    // Esto es crucial para que NestJS utilice nuestro logger en toda la aplicación
    app.useLogger(appLoggerInstance);

    // Log de inicio de bootstrap
    applicationLog.logBootstrapStart();
    appLoggerInstance.info('🏁 Iniciando Bootstrap de la aplicación NestJS');


    // Middlewares y CORS (ejemplo simplificado, adaptar de boostrap.ts si es necesario)
    // Se asume que `boostrap.ts` ya no maneja la creación de la app, sino este `main.ts`
    // Si `handlers/main/boostrap.ts` sigue siendo relevante, su lógica debe ser integrada aquí o llamada.
    // Por ahora, vamos a quitar la llamada a `bootstrap()` de `handlers/main/boostrap.ts` y mover la lógica esencial aquí.

    const responseTime = await import('response-time');
    app.use(responseTime.default());
    applicationLog.logMiddlewareSetup('Response-time', true);


    const corsOrigins = config.isProduction
      ? [
        'https://creditoya.space',
        'https://intranet-creditoya.vercel.app',
      ]
      : [
        'https://creditoya.space',
        'https://intranet-creditoya.vercel.app',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:3002',
      ];

    app.enableCors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    });
    applicationLog.logCorsSetup(corsOrigins, config.environment);

    const cookieParser = await import('cookie-parser');
    app.use(cookieParser.default());
    applicationLog.logMiddlewareSetup('Cookie parser', true);


    // Iniciar la escucha de la aplicación
    await app.listen(config.port, config.host);

    applicationLog.logServerStart({
      port: config.port,
      host: config.host,
      environment: config.environment,
    });

    appLoggerInstance.info(`🚀 Aplicación NestJS iniciada y escuchando en http://${config.host}:${config.port}`);
    appLoggerInstance.info(`🌍 Entorno: ${config.environment}`);


    // Manejo de señales del sistema para cierre elegante
    async function gracefulShutdown(signal: string) {
      applicationLog.logSignalReceived(signal, config);
      appLoggerInstance.info(`📴 Recibida señal ${signal}. Cerrando aplicación...`);

      try {
        await app.close();
        await httpTransport.forceFlush();
        await appLoggerInstance.close();
        appLoggerInstance.info('✅ Aplicación cerrada correctamente.');
        process.exit(0);
      } catch (error) {
        appLoggerInstance.error('❌ Error durante el cierre elegante:', error);
        process.exit(1);
      }
    }

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    // ... otros listeners de señales si son necesarios

  } catch (error) {
    // Log de error fatal usando ApplicationLoggerService
    // Asegurarse de que appLoggerInstance exista, o usar un logger de emergencia si falla muy temprano
    const loggerToUse = appLoggerInstance || new LoggerService(new HttpTransportService());
    loggerToUse.setContext('MainApplication-Fatal');

    const errorDetails = {
      config,
      processInfo: {
        cwd: process.cwd(),
        nodeVersion: process.version,
        argv: process.argv,
        uptime: process.uptime(),
      },
    };

    if (applicationLog) {
        applicationLog.logFatalError(error, 'Bootstrap', errorDetails);
    } else {
        loggerToUse.fatal('Error fatal durante el bootstrap de la aplicación', error, errorDetails);
    }


    // Flush logs antes de salir
    try {
      if (httpTransport) await httpTransport.forceFlush();
      if (appLoggerInstance) await appLoggerInstance.close();
    } catch (logError) {
      console.error('❌ Error adicional cerrando logger en caso de error fatal:', logError);
    }

    process.exit(1);
  }
}

// Capturar errores no manejados globalmente
// Es importante que el logger esté disponible aquí
// Estas instancias se crean al inicio de bootstrap()
let mainLoggerInstance: LoggerService;
let mainHttpTransport: HttpTransportService;
let mainApplicationLog: ApplicationLoggerService;

// Inicializar instancias de logger para uso global en handlers de process
(async () => {
  mainHttpTransport = new HttpTransportService();
  mainLoggerInstance = new LoggerService(mainHttpTransport);
  mainApplicationLog = new ApplicationLoggerService(mainLoggerInstance, mainHttpTransport);
  mainLoggerInstance.setContext('GlobalProcessEvents');
})();


process.on('uncaughtException', async (error) => {
  const config = { nodeEnv: process.env.NODE_ENV }; // Configuración mínima
  if (mainApplicationLog) {
    mainApplicationLog.logFatalError(error, 'UncaughtException', {
      config,
      processInfo: { cwd: process.cwd(), nodeVersion: process.version, argv: process.argv, uptime: process.uptime() },
    });
  } else if (mainLoggerInstance) {
    mainLoggerInstance.fatal('Excepción no capturada', error, { context: 'UncaughtException' });
  } else {
    console.error('FALLBACK LOGGER: UncaughtException', error);
  }

  if (mainHttpTransport) await mainHttpTransport.forceFlush();
  if (mainLoggerInstance) await mainLoggerInstance.close();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  const config = { nodeEnv: process.env.NODE_ENV }; // Configuración mínima
  if (mainApplicationLog) {
    mainApplicationLog.logFatalError(reason, 'UnhandledRejection', {
      config,
      promise: promise?.toString(),
      processInfo: { cwd: process.cwd(), nodeVersion: process.version, argv: process.argv, uptime: process.uptime() },
    });
  } else if (mainLoggerInstance) {
    mainLoggerInstance.fatal('Rechazo de promesa no manejado', reason as Error, { context: 'UnhandledRejection', promise });
  } else {
    console.error('FALLBACK LOGGER: UnhandledRejection', reason);
  }

  if (mainHttpTransport) await mainHttpTransport.forceFlush();
  if (mainLoggerInstance) await mainLoggerInstance.close();
  process.exit(1);
});

// Inicializar la aplicación
bootstrap();

// Exportar instancias si es necesario, aunque es mejor inyectarlas donde se necesiten.
// export { appLoggerInstance, httpTransport, applicationLog }; // appLoggerInstance no está en este scope global.