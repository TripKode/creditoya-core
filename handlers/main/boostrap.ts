import { NestFactory } from '@nestjs/core';
import { checkPortStatus } from './CheckPorts';
import { AppModule } from 'src/app.module';
import { Logger } from '@nestjs/common';
import { CustomLoggerService } from 'src/services/logger.service';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Logger nativo de NestJS para bootstrap inicial
const logger = new Logger('Bootstrap');

export async function bootstrap() {
  try {
    // Logging inicial con Logger nativo
    logger.log('🚀 Iniciando aplicación NestJS');
    logger.log(`🕐 Timestamp: ${new Date().toISOString()}`);
    logger.log(`📁 Working Directory: ${process.cwd()}`);
    logger.log(`🔧 Node Version: ${process.version}`);
    logger.log(`🌐 NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
    logger.log(`📦 PORT env: ${process.env.PORT || 'undefined'}`);

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

    logger.log(`🌐 Entorno detectado: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    logger.log(`🎯 Puerto configurado: ${port}`);
    logger.log(`🏠 Host configurado: ${host}`);

    console.log(`🌐 Entorno detectado: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`🎯 Puerto configurado: ${port}`);
    console.log(`🏠 Host configurado: ${host}`);

    // VERIFICAR ESTADO DEL PUERTO ANTES DE CREAR LA APP
    console.log(`\n🔍 === VERIFICANDO PUERTO ${port} ===`);
    logger.log(`🔍 Verificando disponibilidad del puerto ${port}`);

    const isPortOccupied = await checkPortStatus(port, host);

    // En desarrollo, verificar también en otras interfaces comunes
    let isPortOccupiedElsewhere = false;
    if (!isProduction) {
      isPortOccupiedElsewhere = await checkPortStatus(port, '0.0.0.0');
      console.log(`📊 Puerto ${port} en 0.0.0.0: ${isPortOccupiedElsewhere ? 'OCUPADO' : 'LIBRE'}`);
    }

    console.log(`📊 Puerto ${port} en ${host}: ${isPortOccupied ? 'OCUPADO' : 'LIBRE'}`);

    if (isPortOccupied || isPortOccupiedElsewhere) {
      logger.error(`❌ Puerto ${port} ya está en uso`);
      console.log(`❌ PUERTO ${port} YA ESTÁ EN USO - ABORTANDO`);
      console.log(`💡 Para liberar el puerto ${port}, ejecuta:`);
      console.log(`   🔧 npx kill-port ${port}`);
      console.log(`   🔧 lsof -ti:${port} | xargs kill -9`);
      console.log(`   🔧 netstat -tulpn | grep :${port}`);
      process.exit(1);
    }

    console.log('\n🏗️ === CREANDO APLICACIÓN NESTJS ===');
    logger.log('🏗️ Creando aplicación NestJS');

    // Crear la aplicación
    const app = await NestFactory.create(AppModule, {
      logger: ['log', 'error', 'warn', 'debug', 'verbose']
    });

    // **CONFIGURAR LOGGER PERSONALIZADO DESPUÉS DE CREAR LA APP**
    const customLogger = app.get(CustomLoggerService);
    app.useLogger(customLogger);

    // Verificar estado del logging externo
    const isExternalLoggingEnabled = customLogger.isExternalLoggingEnabled();

    // Desde aquí, usar el logger personalizado que enviará logs al servidor
    customLogger.log('✅ Aplicación NestJS creada exitosamente', 'Bootstrap');
    customLogger.logWithMetadata('info', 'Aplicación NestJS iniciada', {
      port,
      host,
      environment: isProduction ? 'PRODUCTION' : 'DEVELOPMENT',
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    }, 'Bootstrap');

    console.log('✅ Aplicación NestJS creada exitosamente');

    // Mostrar estado del logging externo según el entorno
    if (isProduction) {
      console.log('🚫 Logger personalizado configurado - envío de logs al servidor externo DESHABILITADO (PRODUCCIÓN)');
    } else {
      console.log('✅ Logger personalizado configurado - enviando logs al servidor externo');
    }

    console.log(`📊 Estado del logging externo: ${isExternalLoggingEnabled ? 'HABILITADO' : 'DESHABILITADO'}`);

    // **CONFIGURAR SWAGGER SOLO EN DESARROLLO**
    if (!isProduction) {
      console.log('\n📚 === CONFIGURANDO SWAGGER (DESARROLLO) ===');
      const config = new DocumentBuilder()
        .setTitle('CreditoYa Core API')
        .setDescription('API principal del sistema CreditoYa')
        .setVersion('1.0')
        .addTag('auth', 'Autenticación y autorización')
        .addTag('loans', 'Gestión de préstamos')
        .addTag('clients', 'Gestión de clientes')
        .addTag('pdfs', 'Generación de PDFs')
        .addTag('mail', 'Envío de correos')
        .addTag('cloudinary', 'Gestión de archivos en la nube')
        .addTag('backup', 'Copias de seguridad')
        .addTag('dev', 'Herramientas de desarrollo')
        .addTag('mcp', 'Model Context Protocol')
        .addTag('password-reset', 'Restablecimiento de contraseña')
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api', app, document);

      customLogger.log('✅ Swagger configurado en /api (solo desarrollo)', 'Bootstrap');
      console.log('✅ Swagger configurado en /api (solo desarrollo)');
    } else {
      customLogger.log('🚫 Swagger deshabilitado en producción', 'Bootstrap');
      console.log('🚫 Swagger deshabilitado en producción');
    }

    // Middleware response-time con manejo de errores
    console.log('\n🔧 === CONFIGURANDO MIDDLEWARES ===');
    customLogger.log('🔧 Configurando middlewares', 'Bootstrap');

    try {
      const responseTime = await import('response-time');
      const middleware = responseTime.default || responseTime;
      if (typeof middleware === 'function') {
        app.use(middleware());
        customLogger.log('✅ Response-time middleware configurado', 'Bootstrap');
        console.log('✅ Response-time middleware configurado');
      } else {
        customLogger.warn('⚠️ Response-time middleware no es una función válida', 'Bootstrap');
        console.warn('⚠️ Response-time middleware no es una función válida');
      }
    } catch (error) {
      customLogger.error('⚠️ No se pudo cargar response-time middleware', error.stack, 'Bootstrap');
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

    customLogger.logWithMetadata('info', 'CORS configurado', {
      origins: corsOrigins,
      environment: isProduction ? 'PRODUCTION' : 'DEVELOPMENT',
      originsCount: corsOrigins.length
    }, 'Bootstrap');

    console.log(`✅ CORS configurado para ${corsOrigins.length} orígenes`);
    console.log(`📝 Orígenes permitidos: ${corsOrigins.join(', ')}`);

    // Cookie parser con manejo de errores
    console.log('\n🍪 === CONFIGURANDO COOKIE PARSER ===');
    try {
      const cookieParser = await import('cookie-parser');
      const middleware = cookieParser.default || cookieParser;
      if (typeof middleware === 'function') {
        app.use(middleware());
        customLogger.log('✅ Cookie parser configurado', 'Bootstrap');
        console.log('✅ Cookie parser configurado');
      } else {
        customLogger.warn('⚠️ Cookie parser no es una función válida', 'Bootstrap');
        console.warn('⚠️ Cookie parser no es una función válida');
      }
    } catch (error) {
      customLogger.error('⚠️ No se pudo cargar cookie-parser', error.stack, 'Bootstrap');
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

    // Log del servidor iniciado
    customLogger.logWithMetadata('info', 'Servidor iniciado exitosamente', {
      port,
      host,
      environment: isProduction ? 'PRODUCTION' : 'DEVELOPMENT',
      timestamp: new Date().toISOString(),
      urls: [`http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`]
    }, 'Bootstrap');

    console.log(`\n🎉 === SERVIDOR INICIADO EXITOSAMENTE ===`);
    console.log(`🔗 Aplicación NestJS disponible en http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(`🌍 Host: ${host}:${port}`);
    console.log(`🏷️ Entorno: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`⏰ Iniciado a las: ${new Date().toLocaleString()}`);

    // VERIFICACIÓN POST-INICIO
    console.log('\n🔬 === VERIFICACIÓN POST-INICIO ===');
    setTimeout(async () => {
      const postStartCheck = await checkPortStatus(port, host);

      customLogger.logWithMetadata('info', 'Verificación post-inicio completada', {
        port,
        host,
        portOccupied: postStartCheck,
        serverRunning: postStartCheck
      }, 'Bootstrap');

      console.log(`📊 Estado del puerto después del inicio: ${postStartCheck ? 'OCUPADO ✅' : 'LIBRE ❌'}`);

      if (!postStartCheck) {
        customLogger.warn(`⚠️ Servidor inició pero puerto ${port} no está ocupado`, 'Bootstrap');
        console.log(`⚠️ ADVERTENCIA: El servidor dice que inició pero el puerto ${port} no está ocupado`);
      } else {
        customLogger.log(`🎯 Servidor funcionando correctamente en ${host}:${port}`, 'Bootstrap');
        console.log(`🎯 Confirmado: Servidor funcionando correctamente en ${host}:${port}`);
      }
    }, 1000);

    // *** CONFIGURAR MANEJO DE SEÑALES ***
    const gracefulShutdown = async (signal: string) => {
      customLogger.logWithMetadata('info', 'Señal recibida - cerrando aplicación gracefully', {
        signal,
        port,
        host,
        environment: isProduction ? 'PRODUCTION' : 'DEVELOPMENT'
      }, 'Bootstrap');
      
      console.log(`\n📴 Señal ${signal} recibida - cerrando aplicación gracefully...`);

      try {
        // Forzar envío de logs pendientes antes de cerrar
        await customLogger.forceFlush();
        
        await app.close();
        
        customLogger.log('✅ Aplicación cerrada correctamente', 'Bootstrap');
        console.log('✅ Aplicación cerrada correctamente');
        process.exit(0);
      } catch (error) {
        customLogger.error('❌ Error durante el cierre de la aplicación', error.stack, 'Bootstrap');
        console.error('❌ Error durante el cierre:', error);
        process.exit(1);
      }
    };

    // Registrar listeners para shutdown graceful
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Retornar la app para uso en main.ts si es necesario
    return app;

  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production';
    const port = isProduction ? 8080 : 3000;

    // Log estructurado del error
    logger.error('❌ Error fatal durante el bootstrap', error.stack);

    console.error('\n❌ === ERROR DURANTE EL INICIO ===');
    console.error('💥 Error:', error.message);

    if (error.code === 'EADDRINUSE') {
      logger.error(`🚫 Puerto ${port} ya está en uso`);
      console.error(`🚫 ¡PUERTO ${port} YA ESTÁ EN USO!`);
      console.error(`📋 Para liberar el puerto ${port}, ejecuta:`);
      console.error(`   🔧 npx kill-port ${port}`);
      console.error(`   🔧 lsof -ti:${port} | xargs kill -9`);
      console.error(`   🔧 netstat -tulpn | grep :${port}`);
    } else if (error.code === 'EACCES') {
      logger.error(`🚫 Sin permisos para puerto ${port}`);
      console.error(`🚫 Sin permisos para usar el puerto ${port}`);
      console.error(`💡 Prueba ejecutar como administrador o usa un puerto > 1024`);
    } else {
      logger.error('🤔 Error desconocido en bootstrap');
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