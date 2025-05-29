import { bootstrap } from "handlers/main/boostrap";

// Función para obtener la configuración del puerto según entorno
function getPortConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  return {
    port: isProduction ? 8080 : 3000,
    host: isProduction ? '0.0.0.0' : '127.0.0.1',
    environment: isProduction ? 'PRODUCTION' : 'DEVELOPMENT',
    nodeEnv: nodeEnv
  };
}

// Manejo más agresivo de señales para asegurar que libere el puerto
process.on('SIGINT', async () => {
  const config = getPortConfig();
  console.log('\n📴 === RECIBIDA SEÑAL SIGINT ===');
  console.log(`🔄 Liberando puerto ${config.port} en ${config.host} y cerrando aplicación...`);
  console.log(`🌐 Entorno: ${config.environment}`);
  process.exit(0);
});

process.on('SIGTERM', async () => {
  const config = getPortConfig();
  console.log('\n📴 === RECIBIDA SEÑAL SIGTERM ===');
  console.log(`🔄 Liberando puerto ${config.port} en ${config.host} y cerrando aplicación...`);
  console.log(`🌐 Entorno: ${config.environment}`);
  process.exit(0);
});

process.on('SIGUSR1', async () => {
  const config = getPortConfig();
  console.log('\n📴 === RECIBIDA SEÑAL SIGUSR1 ===');
  console.log(`🔄 Liberando puerto ${config.port} en ${config.host} y cerrando aplicación...`);
  console.log(`🌐 Entorno: ${config.environment}`);
  process.exit(0);
});

process.on('SIGUSR2', async () => {
  const config = getPortConfig();
  console.log('\n📴 === RECIBIDA SEÑAL SIGUSR2 ===');
  console.log(`🔄 Liberando puerto ${config.port} en ${config.host} y cerrando aplicación...`);
  console.log(`🌐 Entorno: ${config.environment}`);
  process.exit(0);
});

// Capturar errores no manejados
process.on('uncaughtException', (error) => {
  const config = getPortConfig();
  console.error('\n💥 === EXCEPCIÓN NO CAPTURADA ===');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  console.error(`🔧 Entorno: ${config.environment} (${config.host}:${config.port})`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  const config = getPortConfig();
  console.error('\n💥 === PROMESA RECHAZADA NO MANEJADA ===');
  console.error('Razón:', reason);
  console.error('Promesa:', promise);
  console.error(`🔧 Entorno: ${config.environment} (${config.host}:${config.port})`);
  process.exit(1);
});

// Manejo especial para DOCKER/Kubernetes (common in production)
process.on('SIGTERM', () => {
  const config = getPortConfig();
  console.log('\n🐳 === SEÑAL DE CONTENEDOR DOCKER/K8S ===');
  console.log(`🔄 Cerrando aplicación ${config.environment} gracefully...`);
  console.log(`📋 Puerto ${config.port} en ${config.host} será liberado`);
  process.exit(0);
});

// Log inicial de configuración
const config = getPortConfig();
console.log('\n🚀 === CONFIGURACIÓN INICIAL ===');
console.log(`🌐 NODE_ENV: ${config.nodeEnv}`);
console.log(`🎯 Entorno: ${config.environment}`);
console.log(`🚪 Puerto objetivo: ${config.port}`);
console.log(`🏠 Host objetivo: ${config.host}`);
console.log(`🕐 Timestamp: ${new Date().toISOString()}`);

if (config.nodeEnv === 'development') {
  console.log('🔧 Ejecutando en modo desarrollo local');
} else if (config.nodeEnv === 'production') {
  console.log('🚀 Ejecutando en modo producción');
} else {
  console.log(`⚠️ NODE_ENV personalizado: ${config.nodeEnv} (usando config de desarrollo)`);
}

console.log('\n🏁 === INICIANDO BOOTSTRAP ===');

bootstrap().catch((error) => {
  const config = getPortConfig();
  console.error('\n💥 === ERROR FATAL EN BOOTSTRAP ===');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  console.error(`🔧 Configuración al fallar: ${config.environment} (${config.host}:${config.port})`);

  // Información adicional para debugging
  console.error('\n🔍 === DEBUG INFO ===');
  console.error(`📁 CWD: ${process.cwd()}`);
  console.error(`🔧 Node: ${process.version}`);
  console.error(`📦 Args: ${process.argv.join(' ')}`);

  process.exit(1);
});