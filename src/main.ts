import { bootstrap } from 'handlers/main/boostrap';

// Manejo más agresivo de señales para asegurar que libere el puerto
process.on('SIGINT', async () => {
  console.log('\n📴 === RECIBIDA SEÑAL SIGINT ===');
  console.log('🔄 Liberando puerto 3000 y cerrando aplicación...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n📴 === RECIBIDA SEÑAL SIGTERM ===');
  console.log('🔄 Liberando puerto 3000 y cerrando aplicación...');
  process.exit(0);
});

process.on('SIGUSR1', async () => {
  console.log('\n📴 === RECIBIDA SEÑAL SIGUSR1 ===');
  console.log('🔄 Liberando puerto 3000 y cerrando aplicación...');
  process.exit(0);
});

process.on('SIGUSR2', async () => {
  console.log('\n📴 === RECIBIDA SEÑAL SIGUSR2 ===');
  console.log('🔄 Liberando puerto 3000 y cerrando aplicación...');
  process.exit(0);
});

// Capturar errores no manejados
process.on('uncaughtException', (error) => {
  console.error('\n💥 === EXCEPCIÓN NO CAPTURADA ===');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 === PROMESA RECHAZADA NO MANEJADA ===');
  console.error('Razón:', reason);
  console.error('Promesa:', promise);
  process.exit(1);
});

console.log('\n🏁 === INICIANDO BOOTSTRAP ===');

bootstrap().catch((error) => {
  console.error('\n💥 === ERROR FATAL EN BOOTSTRAP ===');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});