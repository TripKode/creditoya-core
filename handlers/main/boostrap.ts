import { NestFactory } from '@nestjs/core';
import { checkPortStatus } from './CheckPorts';
import { AppModule } from 'src/app.module';

export async function bootstrap() {
  try {
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
    
    console.log(`🌐 Entorno detectado: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`🎯 Puerto configurado: ${port}`);
    console.log(`🏠 Host configurado: ${host}`);

    // VERIFICAR ESTADO DEL PUERTO ANTES DE CREAR LA APP
    console.log(`\n🔍 === VERIFICANDO PUERTO ${port} ===`);
    const isPortOccupied = await checkPortStatus(port, host);
    
    // En desarrollo, verificar también en otras interfaces comunes
    let isPortOccupiedElsewhere = false;
    if (!isProduction) {
      isPortOccupiedElsewhere = await checkPortStatus(port, '0.0.0.0');
      console.log(`📊 Puerto ${port} en 0.0.0.0: ${isPortOccupiedElsewhere ? 'OCUPADO' : 'LIBRE'}`);
    }

    console.log(`📊 Puerto ${port} en ${host}: ${isPortOccupied ? 'OCUPADO' : 'LIBRE'}`);

    if (isPortOccupied || isPortOccupiedElsewhere) {
      console.log(`❌ PUERTO ${port} YA ESTÁ EN USO - ABORTANDO`);
      console.log(`💡 Para liberar el puerto ${port}, ejecuta:`);
      console.log(`   🔧 npx kill-port ${port}`);
      console.log(`   🔧 lsof -ti:${port} | xargs kill -9`);
      console.log(`   🔧 netstat -tulpn | grep :${port}`);
      process.exit(1);
    }

    console.log('\n🏗️ === CREANDO APLICACIÓN NESTJS ===');
    const app = await NestFactory.create(AppModule);

    console.log('✅ Aplicación NestJS creada exitosamente');

    // Middleware response-time con manejo de errores corregido
    console.log('\n🔧 === CONFIGURANDO MIDDLEWARES ===');
    try {
      const responseTime = await import('response-time');
      const middleware = responseTime.default || responseTime;
      if (typeof middleware === 'function') {
        app.use(middleware());
        console.log('✅ Response-time middleware configurado');
      } else {
        console.warn('⚠️ Response-time middleware no es una función válida');
      }
    } catch (error) {
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

    console.log(`✅ CORS configurado para ${corsOrigins.length} orígenes`);
    console.log(`📝 Orígenes permitidos: ${corsOrigins.join(', ')}`);

    // Cookie parser con manejo de errores corregido
    console.log('\n🍪 === CONFIGURANDO COOKIE PARSER ===');
    try {
      const cookieParser = await import('cookie-parser');
      const middleware = cookieParser.default || cookieParser;
      if (typeof middleware === 'function') {
        app.use(middleware());
        console.log('✅ Cookie parser configurado');
      } else {
        console.warn('⚠️ Cookie parser no es una función válida');
      }
    } catch (error) {
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

    console.log(`\n🎉 === SERVIDOR INICIADO EXITOSAMENTE ===`);
    console.log(`🔗 Aplicación NestJS disponible en http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(`🌍 Host: ${host}:${port}`);
    console.log(`🏷️ Entorno: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`⏰ Iniciado a las: ${new Date().toLocaleString()}`);

    // VERIFICACIÓN POST-INICIO
    console.log('\n🔬 === VERIFICACIÓN POST-INICIO ===');
    setTimeout(async () => {
      const postStartCheck = await checkPortStatus(port, host);
      console.log(`📊 Estado del puerto después del inicio: ${postStartCheck ? 'OCUPADO ✅' : 'LIBRE ❌'}`);

      if (!postStartCheck) {
        console.log(`⚠️ ADVERTENCIA: El servidor dice que inició pero el puerto ${port} no está ocupado`);
      } else {
        console.log(`🎯 Confirmado: Servidor funcionando correctamente en ${host}:${port}`);
      }
    }, 1000);

  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production';
    const port = isProduction ? 8080 : 3000;
    
    console.error('\n❌ === ERROR DURANTE EL INICIO ===');
    console.error('💥 Error:', error.message);

    if (error.code === 'EADDRINUSE') {
      console.error(`🚫 ¡PUERTO ${port} YA ESTÁ EN USO!`);
      console.error(`📋 Para liberar el puerto ${port}, ejecuta:`);
      console.error(`   🔧 npx kill-port ${port}`);
      console.error(`   🔧 lsof -ti:${port} | xargs kill -9`);
      console.error(`   🔧 netstat -tulpn | grep :${port}`);
    } else if (error.code === 'EACCES') {
      console.error(`🚫 Sin permisos para usar el puerto ${port}`);
      console.error(`💡 Prueba ejecutar como administrador o usa un puerto > 1024`);
    } else {
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