import { Logger } from '@nestjs/common';
import { bootstrap } from "handlers/main/boostrap";

const logger = new Logger();

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
    // Log usando Logger nativo
    logger.log(`📴 Señal ${signal} recibida - cerrando aplicación gracefully`, {
      event: 'signal_received',
      signal,
      config,
      timestamp: new Date().toISOString()
    });
    
    // Log adicional en consola para mantener compatibilidad
    console.log(`\n📴 === RECIBIDA SEÑAL ${signal} ===`);
    console.log(`🔄 Liberando puerto ${config.port} en ${config.host} y cerrando aplicación...`);
    console.log(`🌐 Entorno: ${config.environment}`);
    
    logger.log('✅ Aplicación cerrada correctamente', {
      event: 'graceful_shutdown_complete',
      signal,
      exitCode
    });
    
    console.log('🔄 Aplicación cerrada correctamente');
    process.exit(exitCode);
  } catch (error) {
    logger.error('❌ Error durante el cierre de la aplicación', error.stack);
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
    // Log usando Logger nativo
    logger.error('💥 Excepción no capturada', error.stack, {
      event: 'uncaught_exception',
      config,
      processInfo: {
        cwd: process.cwd(),
        nodeVersion: process.version,
        argv: process.argv,
        uptime: process.uptime()
      }
    });

    // Mantener logs de consola para compatibilidad
    console.error('\n💥 === EXCEPCIÓN NO CAPTURADA ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    console.error(`🔧 Entorno: ${config.environment} (${config.host}:${config.port})`);
    
  } catch (logError) {
    console.error('❌ Error adicional durante el logging:', logError);
  }
  
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  const config = getPortConfig();

  try {
    // Log usando Logger nativo
    logger.error('💥 Promesa rechazada no manejada', (reason as any)?.stack || String(reason), {
      event: 'unhandled_rejection',
      config,
      promise: promise.toString(),
      processInfo: {
        cwd: process.cwd(),
        nodeVersion: process.version,
        argv: process.argv,
        uptime: process.uptime()
      }
    });

    console.error('\n💥 === PROMESA RECHAZADA NO MANEJADA ===');
    console.error('Razón:', reason);
    console.error('Promesa:', promise);
    console.error(`🔧 Entorno: ${config.environment} (${config.host}:${config.port})`);
    
  } catch (logError) {
    console.error('❌ Error adicional durante el logging:', logError);
  }
  
  process.exit(1);
});

// Inicialización de la aplicación
async function initializeApplication() {
  const config = getPortConfig();

  try {
    // Log de configuración inicial usando Logger nativo
    logger.log('🚀 Iniciando configuración de aplicación', {
      event: 'configuration_start',
      config,
      timestamp: new Date().toISOString()
    });

    // Mantener logs de consola para compatibilidad visual
    console.log('\n🚀 === CONFIGURACIÓN INICIAL ===');
    console.log(`🌐 NODE_ENV: ${config.nodeEnv}`);
    console.log(`🎯 Entorno: ${config.environment}`);
    console.log(`🚪 Puerto objetivo: ${config.port}`);
    console.log(`🏠 Host objetivo: ${config.host}`);
    console.log(`🕐 Timestamp: ${new Date().toISOString()}`);

    // Logs específicos por entorno
    if (config.nodeEnv === 'development') {
      logger.log('🔧 Ejecutando en modo desarrollo local', {
        event: 'development_mode',
        config
      });
      console.log('🔧 Ejecutando en modo desarrollo local');
    } else if (config.nodeEnv === 'production') {
      logger.log('🚀 Ejecutando en modo producción', {
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
    logger.log('🏁 Iniciando bootstrap de aplicación', {
      event: 'bootstrap_start',
      config
    });
    console.log('\n🏁 === INICIANDO BOOTSTRAP ===');

    // Ejecutar bootstrap
    await bootstrap();
    
    // Log de éxito del bootstrap
    logger.log('✅ Bootstrap completado exitosamente', {
      event: 'bootstrap_success',
      config,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    // Log de error fatal usando Logger nativo
    logger.error('💥 Error fatal en bootstrap', error.stack, {
      event: 'fatal_bootstrap_error',
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

    process.exit(1);
  }
}

// Inicializar aplicación
initializeApplication();

// Exportar servicios para uso en otros módulos si es necesario
export {
  logger,
  getPortConfig
};