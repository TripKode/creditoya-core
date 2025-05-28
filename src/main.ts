import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    console.log('🚀 Iniciando aplicación NestJS...');
    
    const app = await NestFactory.create(AppModule);
    
    console.log('✅ Aplicación NestJS creada exitosamente');

    // Middleware opcional con manejo de errores
    try {
      const responseTime = await import('response-time');
      app.use(responseTime.default());
      console.log('✅ Response-time middleware configurado');
    } catch (error) {
      console.warn('⚠️ No se pudo cargar response-time middleware:', error.message);
    }

    // CORS configuration
    app.enableCors({
      origin: [
        'https://www.creditoya.space',
        'https://intranet-creditoya.vercel.app',
        // Para desarrollo local (opcional)
        'http://localhost:3001',
        'http://localhost:3002'
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    });
    
    console.log('✅ CORS configurado');

    // Cookie parser opcional
    try {
      const cookieParser = await import('cookie-parser');
      app.use(cookieParser.default());
      console.log('✅ Cookie parser configurado');
    } catch (error) {
      console.warn('⚠️ No se pudo cargar cookie-parser:', error.message);
    }

    // Configuración del puerto con detección de entorno
    const isProduction = process.env.NODE_ENV === 'production';
    const port = process.env.PORT || (isProduction ? 8080 : 3000);
    const host = isProduction ? '0.0.0.0' : 'localhost';
    
    console.log(`🌐 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Intentando iniciar servidor en ${host}:${port}...`);
    
    await app.listen(port, host);
    
    console.log(`🎉 Servidor iniciado exitosamente en ${host}:${port}`);
    console.log(`🔗 Aplicación disponible en http://${host}:${port}`);
    
  } catch (error) {
    console.error('❌ Error durante el inicio de la aplicación:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Manejo de señales para graceful shutdown
process.on('SIGINT', () => {
  console.log('📴 Recibida señal SIGINT, cerrando aplicación...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('📴 Recibida señal SIGTERM, cerrando aplicación...');
  process.exit(0);
});

bootstrap().catch((error) => {
  console.error('💥 Error fatal en bootstrap:', error);
  process.exit(1);
});