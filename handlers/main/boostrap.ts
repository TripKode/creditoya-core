import { NestFactory } from '@nestjs/core';
import { checkPortStatus } from './CheckPorts';
import { AppModule } from 'src/app.module';
import { LoggerService } from 'src/logger/logger.service';
import { LoggerConfigService } from 'src/logger/service/config.service';
import { HttpTransportService } from 'src/logger/service/http-transport.service';
import { ApplicationLoggerService } from 'src/logger/service/application.service';

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
    console.log('🚀 === DEBUG: Iniciando aplicación NestJS ===');
    console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
    console.log(`📁 Working Directory: ${process.cwd()}`);
    console.log(`🔧 Node Version: ${process.version}`);
    console.log(`🌐 NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
    console.log(`📦 PORT env: ${process.env.PORT || 'undefined'}`);

    // CONFIGURACIÓN DINÁMICA SEGÚN ENTORNO
    console.log('\n🎯 === CONFIGURACIÓN DE ENTORNO ===');
    const isProduction = process.env.NODE_ENV === 'production';

    // Puerto y host según entorno
    const port = isProduction ? 8080 : 3000;
    const host = isProduction ? '0.0.0.0' : '127.0.0.1';

    const environmentConfig = {
      isProduction,
      port,
      host,
      environment: isProduction ? 'PRODUCTION' : 'DEVELOPMENT'
    };

    bootstrapLogger.info('🎯 Configuración de entorno determinada', {
      event: 'environment_config',
      ...environmentConfig
    });

    console.log(`🌐 Entorno detectado: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`🎯 Puerto configurado: ${port}`);
    console.log(`🏠 Host configurado: ${host}`);

    // VERIFICAR ESTADO DEL PUERTO ANTES DE CREAR LA APP
    console.log(`\n🔍 === VERIFICANDO PUERTO ${port} ===`);
    bootstrapLogger.info(`🔍 Verificando disponibilidad del puerto ${port}`, {
      event: 'port_check_start',
      port,
      host
    });

    const isPortOccupied = await checkPortStatus(port, host);

    // En desarrollo, verificar también en otras interfaces comunes
    let isPortOccupiedElsewhere = false;
    if (!isProduction) {
      isPortOccupiedElsewhere = await checkPortStatus(port, '0.0.0.0');
      console.log(`📊 Puerto ${port} en 0.0.0.0: ${isPortOccupiedElsewhere ? 'OCUPADO' : 'LIBRE'}`);
    }

    console.log(`📊 Puerto ${port} en ${host}: ${isPortOccupied ? 'OCUPADO' : 'LIBRE'}`);

    if (isPortOccupied || isPortOccupiedElsewhere) {
      bootstrapLogger.error(`❌ Puerto ${port} ya está en uso`, {
        event: 'port_occupied_error',
        port,
        host,
        occupiedOnHost: isPortOccupied,
        occupiedOnWildcard: isPortOccupiedElsewhere
      });

      console.log(`❌ PUERTO ${port} YA ESTÁ EN USO - ABORTANDO`);
      console.log(`💡 Para liberar el puerto ${port}, ejecuta:`);
      console.log(`   🔧 npx kill-port ${port}`);
      console.log(`   🔧 lsof -ti:${port} | xargs kill -9`);
      console.log(`   🔧 netstat -tulpn | grep :${port}`);
      process.exit(1);
    }

    console.log('\n🏗️ === CREANDO APLICACIÓN NESTJS ===');
    bootstrapLogger.info('🏗️ Creando aplicación NestJS', {
      event: 'nestjs_app_creation_start'
    });

    const app = await NestFactory.create(AppModule);

    // *** CONFIGURAR EL LOGGER GLOBAL DE LA APLICACIÓN ***
    const appLogger = app.get(LoggerService);
    app.useLogger(appLogger);

    bootstrapLogger.info('✅ Aplicación NestJS creada exitosamente', {
      event: 'nestjs_app_created'
    });
    console.log('✅ Aplicación NestJS creada exitosamente');
    console.log('✅ Logger global configurado');

    // Middleware response-time con manejo de errores corregido
    console.log('\n🔧 === CONFIGURANDO MIDDLEWARES ===');
    appLogger.info('🔧 Configurando middlewares', {
      event: 'middleware_setup_start'
    });

    try {
      const responseTime = await import('response-time');
      const middleware = responseTime.default || responseTime;
      if (typeof middleware === 'function') {
        app.use(middleware());
        applicationLog.logMiddlewareSetup('Response-time', true);
        console.log('✅ Response-time middleware configurado');
      } else {
        applicationLog.logMiddlewareSetup('Response-time', false, { reason: 'No es una función válida' });
        console.warn('⚠️ Response-time middleware no es una función válida');
      }
    } catch (error) {
      applicationLog.logMiddlewareSetup('Response-time', false, error);
      console.warn('⚠️ No se pudo cargar response-time middleware:', error.message);
    }

    // CORS configuration adaptada al entorno
    console.log('\n🌐 === CONFIGURANDO CORS ===');
    const corsOrigins = isProduction
      ? [
        'https://creditoya.space',
        'https://intranet-creditoya.vercel.app'
      ]
      : [
        'https://creditoya.space',
        'https://intranet-creditoya.vercel.app',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:3002'
      ];

    app.enableCors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    });

    applicationLog.logCorsSetup(corsOrigins, environmentConfig.environment);

    console.log(`✅ CORS configurado para ${corsOrigins.length} orígenes`);
    console.log(`📝 Orígenes permitidos: ${corsOrigins.join(', ')}`);

    // Cookie parser con manejo de errores corregido
    console.log('\n🍪 === CONFIGURANDO COOKIE PARSER ===');
    try {
      const cookieParser = await import('cookie-parser');
      const middleware = cookieParser.default || cookieParser;
      if (typeof middleware === 'function') {
        app.use(middleware());
        applicationLog.logMiddlewareSetup('Cookie parser', true);
        console.log('✅ Cookie parser configurado');
      } else {
        applicationLog.logMiddlewareSetup('Cookie parser', false, { reason: 'No es una función válida' });
        console.warn('⚠️ Cookie parser no es una función válida');
      }
    } catch (error) {
      applicationLog.logMiddlewareSetup('Cookie parser', false, error);
      console.warn('⚠️ No se pudo cargar cookie-parser:', error.message);
    }

    console.log(`\n🚀 === INICIANDO SERVIDOR EN ${host}:${port} ===`);

    // VERIFICAR PUERTO UNA VEZ MÁS ANTES DE INICIAR
    console.log('\n🔍 === VERIFICACIÓN FINAL DEL PUERTO ===');
    const finalPortCheck = await checkPortStatus(port, host);
    if (finalPortCheck) {
      console.log(`❌ PUERTO ${port} TODAVÍA OCUPADO EN ${host} - ALGO ESTÁ MAL`);
      throw new Error(`Puerto ${port} en ${host} aún está ocupado`);
    }

    console.log(`✅ Puerto ${port} confirmado como libre en ${host}`);
    console.log('🚀 === INICIANDO SERVIDOR ===');

    // Iniciar servidor
    await app.listen(port, host);

    // Usar el logger de la aplicación para el log del servidor iniciado
    applicationLog.logServerStart({
      port,
      host,
      environment: environmentConfig.environment
    });

    console.log(`\n🎉 === SERVIDOR INICIADO EXITOSAMENTE ===`);
    console.log(`🔗 Aplicación NestJS disponible en http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(`🌍 Host: ${host}:${port}`);
    console.log(`🏷️ Entorno: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`⏰ Iniciado a las: ${new Date().toLocaleString()}`);

    // VERIFICACIÓN POST-INICIO
    console.log('\n🔬 === VERIFICACIÓN POST-INICIO ===');
    setTimeout(async () => {
      const postStartCheck = await checkPortStatus(port, host);

      appLogger.info('🔬 Verificación post-inicio completada', {
        event: 'post_start_check',
        port,
        host,
        portOccupied: postStartCheck,
        serverRunning: postStartCheck
      });

      console.log(`📊 Estado del puerto después del inicio: ${postStartCheck ? 'OCUPADO ✅' : 'LIBRE ❌'}`);

      if (!postStartCheck) {
        appLogger.warn('⚠️ Servidor inició pero puerto no está ocupado', {
          event: 'server_port_mismatch',
          port,
          host
        });
        console.log(`⚠️ ADVERTENCIA: El servidor dice que inició pero el puerto ${port} no está ocupado`);
      } else {
        appLogger.info('🎯 Servidor funcionando correctamente', {
          event: 'server_confirmed',
          port,
          host
        });
        console.log(`🎯 Confirmado: Servidor funcionando correctamente en ${host}:${port}`);
      }
    }, 1000);

    // *** CONFIGURAR MANEJO DE SEÑALES ***
    const gracefulShutdown = (signal: string) => {
      applicationLog.logSignalReceived(signal, { port, host, environment: environmentConfig.environment });
      console.log(`\n📴 Señal ${signal} recibida - cerrando aplicación gracefully...`);

      app.close().then(() => {
        appLogger.info('✅ Aplicación cerrada correctamente', {
          event: 'graceful_shutdown_complete',
          signal,
          timestamp: new Date().toISOString()
        });
        console.log('✅ Aplicación cerrada correctamente');
        process.exit(0);
      }).catch((error) => {
        appLogger.error('❌ Error durante el cierre de la aplicación', error, {
          event: 'graceful_shutdown_error',
          signal
        });
        console.error('❌ Error durante el cierre:', error);
        process.exit(1);
      });
    };

    // Registrar listeners para shutdown graceful
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production';
    const port = isProduction ? 8080 : 3000;

    // Log estructurado del error
    applicationLog.logFatalError(error, 'Bootstrap', {
      config: {
        port,
        isProduction,
        nodeEnv: process.env.NODE_ENV,
        cwd: process.cwd()
      }
    });

    console.error('\n❌ === ERROR DURANTE EL INICIO ===');
    console.error('💥 Error:', error.message);

    if (error.code === 'EADDRINUSE') {
      applicationLog.logPortUsageHelp(port);
      console.error(`🚫 ¡PUERTO ${port} YA ESTÁ EN USO!`);
      console.error(`📋 Para liberar el puerto ${port}, ejecuta:`);
      console.error(`   🔧 npx kill-port ${port}`);
      console.error(`   🔧 lsof -ti:${port} | xargs kill -9`);
      console.error(`   🔧 netstat -tulpn | grep :${port}`);
    } else if (error.code === 'EACCES') {
      bootstrapLogger.error(`🚫 Sin permisos para puerto ${port}`, {
        event: 'port_permission_error',
        port,
        errorCode: 'EACCES'
      });

      console.error(`🚫 Sin permisos para usar el puerto ${port}`);
      console.error(`💡 Prueba ejecutar como administrador o usa un puerto > 1024`);
    } else {
      bootstrapLogger.error(`🤔 Error desconocido en bootstrap`, {
        event: 'unknown_bootstrap_error',
        errorCode: error.code || 'Sin código',
        errorMessage: error.message
      });

      console.error(`🤔 Error desconocido: ${error.code || 'Sin código'}`);
    }

    console.error('\n📋 Stack trace completo:');
    console.error(error.stack);

    console.log('\n🔍 === INFORMACIÓN DE DEBUG ===');
    console.log(`📁 Directorio actual: ${process.cwd()}`);
    console.log(`🔧 Argumentos del proceso: ${process.argv.join(' ')}`);
    console.log(`📦 Variables de entorno relacionadas:`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
    console.log(`   PORT: ${process.env.PORT || 'undefined'}`);
    console.log(`   npm_lifecycle_event: ${process.env.npm_lifecycle_event || 'undefined'}`);

    process.exit(1);
  }
}