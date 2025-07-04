import { bootstrap } from "handlers/main/boostrap";
import { LoggerService } from "./logger/logger.service";
import { HttpTransportService } from "./logger/service/http-transport.service";
import { ApplicationLoggerService } from "./logger/service/application.service";

// Inicializar servicios de logging
const httpTransport = new HttpTransportService();
const logger = new LoggerService(httpTransport);
const applicationLog = new ApplicationLoggerService(logger, httpTransport);

// Establecer contexto para el logger principal
logger.setContext('MainApplication');

// Función para obtener la configuración del puerto según entorno
function getPortConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const config = {
    port: isProduction ? 8080 : 3000,
    host: isProduction ? '0.0.0.0' : '127.0.0.1',
    environment: isProduction ? 'PRODUCTION' : 'DEVELOPMENT',
    nodeEnv: nodeEnv
  };

  return config;
}

// Función para cerrar la aplicación de manera elegante
async function gracefulShutdown(signal: string, exitCode: number = 0) {
  const config = getPortConfig();
  
  try {
    // Log usando ApplicationLoggerService
    applicationLog.logSignalReceived(signal, config);
    
    // Log adicional en consola para mantener compatibilidad
    console.log(`\n📴 === RECIBIDA SEÑAL ${signal} ===`);
    console.log(`🔄 Liberando puerto ${config.port} en ${config.host} y cerrando aplicación...`);
    console.log(`🌐 Entorno: ${config.environment}`);
    
    // Flush de logs pendientes antes de cerrar
    await httpTransport.forceFlush();
    
    // Cerrar el logger de manera elegante
    await logger.close();
    
    console.log('🔄 Aplicación cerrada correctamente');
    process.exit(exitCode);
  } catch (error) {
    console.error('❌ Error durante el cierre:', error);
    process.exit(1);
  }
}

// Manejo de señales del sistema
process.on('SIGINT', async () => {
  await gracefulShutdown('SIGINT', 0);
});

process.on('SIGTERM', async () => {
  await gracefulShutdown('SIGTERM', 0);
});

process.on('SIGUSR1', async () => {
  await gracefulShutdown('SIGUSR1', 0);
});

process.on('SIGUSR2', async () => {
  await gracefulShutdown('SIGUSR2', 0);
});

// Capturar errores no manejados
process.on('uncaughtException', async (error) => {
  const config = getPortConfig();

  try {
    // Log usando ApplicationLoggerService
    applicationLog.logFatalError(error, 'UncaughtException', {
      config,
      processInfo: {
        cwd: process.cwd(),
        nodeVersion: process.version,
        argv: process.argv,
        uptime: process.uptime()
      }
    });

    // Flush logs antes de salir
    await httpTransport.forceFlush();
    
    // Mantener logs de consola para compatibilidad
    console.error('\n💥 === EXCEPCIÓN NO CAPTURADA ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    console.error(`🔧 Entorno: ${config.environment} (${config.host}:${config.port})`);
    
    // Cerrar logger
    await logger.close();
    
  } catch (logError) {
    console.error('❌ Error adicional durante el logging:', logError);
  }
  
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  const config = getPortConfig();

  try {
    // Log usando ApplicationLoggerService
    applicationLog.logFatalError(reason, 'UnhandledRejection', {
      config,
      promise: promise.toString(),
      processInfo: {
        cwd: process.cwd(),
        nodeVersion: process.version,
        argv: process.argv,
        uptime: process.uptime()
      }
    });

    // Flush logs antes de salir
    await httpTransport.forceFlush();
    
    console.error('\n💥 === PROMESA RECHAZADA NO MANEJADA ===');
    console.error('Razón:', reason);
    console.error('Promesa:', promise);
    console.error(`🔧 Entorno: ${config.environment} (${config.host}:${config.port})`);
    
    // Cerrar logger
    await logger.close();
    
  } catch (logError) {
    console.error('❌ Error adicional durante el logging:', logError);
  }
  
  process.exit(1);
});

// Manejo especial para DOCKER/Kubernetes
process.on('SIGTERM', async () => {
  const config = getPortConfig();

  try {
    // Log usando el logger principal
    logger.info('🐳 Señal de contenedor Docker/K8S recibida', {
      event: 'docker_k8s_signal',
      config,
      timestamp: new Date().toISOString()
    });

    console.log('\n🐳 === SEÑAL DE CONTENEDOR DOCKER/K8S ===');
    console.log(`🔄 Cerrando aplicación ${config.environment} gracefully...`);
    console.log(`📋 Puerto ${config.port} en ${config.host} será liberado`);

    // Flush logs y cerrar
    await httpTransport.forceFlush();
    await logger.close();
    
  } catch (error) {
    console.error('❌ Error durante cierre de contenedor:', error);
  }
  
  process.exit(0);
});

// Inicialización de la aplicación
async function initializeApplication() {
  const config = getPortConfig();

  try {
    // Log de configuración inicial usando ApplicationLoggerService
    applicationLog.logConfigurationStart(config);

    // Mantener logs de consola para compatibilidad visual
    console.log('\n🚀 === CONFIGURACIÓN INICIAL ===');
    console.log(`🌐 NODE_ENV: ${config.nodeEnv}`);
    console.log(`🎯 Entorno: ${config.environment}`);
    console.log(`🚪 Puerto objetivo: ${config.port}`);
    console.log(`🏠 Host objetivo: ${config.host}`);
    console.log(`🕐 Timestamp: ${new Date().toISOString()}`);

    // Logs específicos por entorno
    if (config.nodeEnv === 'development') {
      logger.info('🔧 Ejecutando en modo desarrollo local', {
        event: 'development_mode',
        config
      });
      console.log('🔧 Ejecutando en modo desarrollo local');
    } else if (config.nodeEnv === 'production') {
      logger.info('🚀 Ejecutando en modo producción', {
        event: 'production_mode',
        config
      });
      console.log('🚀 Ejecutando en modo producción');
    } else {
      logger.warn(`⚠️ NODE_ENV personalizado: ${config.nodeEnv} (usando config de desarrollo)`, {
        event: 'custom_node_env',
        nodeEnv: config.nodeEnv,
        config
      });
      console.log(`⚠️ NODE_ENV personalizado: ${config.nodeEnv} (usando config de desarrollo)`);
    }

    // Log de inicio de bootstrap
    applicationLog.logBootstrapStart();
    console.log('\n🏁 === INICIANDO BOOTSTRAP ===');

    // Ejecutar bootstrap
    await bootstrap();
    
    // Log de éxito del bootstrap
    logger.info('✅ Bootstrap completado exitosamente', {
      event: 'bootstrap_success',
      config,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    // Log de error fatal usando ApplicationLoggerService
    applicationLog.logFatalError(error, 'Bootstrap', {
      config,
      debugInfo: {
        cwd: process.cwd(),
        nodeVersion: process.version,
        argv: process.argv,
        uptime: process.uptime()
      }
    });

    // Mantener logs de consola originales para compatibilidad
    console.error('\n💥 === ERROR FATAL EN BOOTSTRAP ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    console.error(`🔧 Configuración al fallar: ${config.environment} (${config.host}:${config.port})`);

    // Información adicional para debugging
    console.error('\n🔍 === DEBUG INFO ===');
    console.error(`📁 CWD: ${process.cwd()}`);
    console.error(`🔧 Node: ${process.version}`);
    console.error(`📦 Args: ${process.argv.join(' ')}`);
    console.error(`⏱️ Uptime: ${process.uptime()}s`);

    // Flush logs antes de salir
    try {
      await httpTransport.forceFlush();
      await logger.close();
    } catch (logError) {
      console.error('❌ Error adicional cerrando logger:', logError);
    }

    process.exit(1);
  }
}

// Inicializar aplicación
initializeApplication();

// Exportar servicios para uso en otros módulos si es necesario
export {
  logger,
  httpTransport,
  applicationLog,
  getPortConfig
};