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

    // VERIFICAR ESTADO DEL PUERTO ANTES DE CREAR LA APP
    console.log('\n🔍 === VERIFICANDO PUERTO 3000 ===');
    const isPort3000Occupied = await checkPortStatus(3000, '127.0.0.1');
    const isPort3000OccupiedOnAllInterfaces = await checkPortStatus(3000, '0.0.0.0');

    console.log(`📊 Puerto 3000 en 127.0.0.1: ${isPort3000Occupied ? 'OCUPADO' : 'LIBRE'}`);
    console.log(`📊 Puerto 3000 en 0.0.0.0: ${isPort3000OccupiedOnAllInterfaces ? 'OCUPADO' : 'LIBRE'}`);

    if (isPort3000Occupied || isPort3000OccupiedOnAllInterfaces) {
      console.log('❌ PUERTO 3000 YA ESTÁ EN USO - ABORTANDO');
      console.log('💡 Ejecuta: npx kill-port 3000');
      process.exit(1);
    }

    console.log('\n🏗️ === CREANDO APLICACIÓN NESTJS ===');
    const app = await NestFactory.create(AppModule);

    console.log('✅ Aplicación NestJS creada exitosamente');

    // Middleware response-time con manejo de errores corregido
    console.log('\n🔧 === CONFIGURANDO MIDDLEWARES ===');
    try {
      const responseTime = await import('response-time');
      // Prueba diferentes formas de importar
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

    // CORS configuration
    console.log('\n🌐 === CONFIGURANDO CORS ===');
    app.enableCors({
      origin: [
        'https://www.creditoya.space',
        'https://intranet-creditoya.vercel.app',
        // Para desarrollo local
        'http://localhost:3001',
        'http://localhost:3002'
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    });

    console.log('✅ CORS configurado');

    // Cookie parser con manejo de errores corregido
    console.log('\n🍪 === CONFIGURANDO COOKIE PARSER ===');
    try {
      const cookieParser = await import('cookie-parser');
      // Prueba diferentes formas de importar
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

    // Configuración FIJA del puerto 3000
    console.log('\n🎯 === CONFIGURACIÓN DE PUERTO ===');
    const isProduction = process.env.NODE_ENV === 'production';

    // SIEMPRE puerto 3000, independientemente del entorno
    const port = 3000;

    // Host específico según entorno
    const host = isProduction ? '0.0.0.0' : '127.0.0.1';

    console.log(`🌐 Entorno detectado: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🎯 Puerto FORZADO: ${port}`);
    console.log(`🏠 Host seleccionado: ${host}`);
    console.log(`🚀 Intentando iniciar servidor en ${host}:${port}...`);

    // VERIFICAR PUERTO UNA VEZ MÁS ANTES DE INICIAR
    console.log('\n🔍 === VERIFICACIÓN FINAL DEL PUERTO ===');
    const finalPortCheck = await checkPortStatus(port, host);
    if (finalPortCheck) {
      console.log('❌ PUERTO TODAVÍA OCUPADO - ALGO ESTÁ MAL');
      throw new Error(`Puerto ${port} en ${host} aún está ocupado`);
    }

    console.log(`✅ Puerto ${port} confirmado como libre en ${host}`);
    console.log('🚀 === INICIANDO SERVIDOR ===');

    // Intentar iniciar en puerto 3000
    await app.listen(port, host);

    console.log(`\n🎉 === SERVIDOR INICIADO EXITOSAMENTE ===`);
    console.log(`🔗 Aplicación NestJS disponible en http://localhost:${port}`);
    console.log(`🌍 Host: ${host}:${port}`);
    console.log(`⏰ Iniciado a las: ${new Date().toLocaleString()}`);

    // VERIFICACIÓN POST-INICIO
    console.log('\n🔬 === VERIFICACIÓN POST-INICIO ===');
    setTimeout(async () => {
      const postStartCheck = await checkPortStatus(port, host);
      console.log(`📊 Estado del puerto después del inicio: ${postStartCheck ? 'OCUPADO ✅' : 'LIBRE ❌'}`);

      if (!postStartCheck) {
        console.log('⚠️ ADVERTENCIA: El servidor dice que inició pero el puerto no está ocupado');
      }
    }, 1000);

  } catch (error) {
    console.error('\n❌ === ERROR DURANTE EL INICIO ===');
    console.error('💥 Error:', error.message);

    if (error.code === 'EADDRINUSE') {
      console.error(`🚫 ¡PUERTO 3000 YA ESTÁ EN USO!`);
      console.error(`📋 Para liberar el puerto 3000, ejecuta:`);
      console.error(`   🔧 npx kill-port 3000`);
      console.error(`   🔧 lsof -ti:3000 | xargs kill -9`);
      console.error(`   🔧 netstat -tulpn | grep :3000`);
    } else if (error.code === 'EACCES') {
      console.error(`🚫 Sin permisos para usar el puerto 3000`);
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
