import * as net from 'net'

// Función para verificar si un puerto está realmente ocupado
export function checkPortStatus(port: number, host: string = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(1000);
    socket.on('connect', () => {
      console.log(`🔴 Puerto ${port} está OCUPADO en ${host}`);
      socket.destroy();
      resolve(true); // Puerto ocupado
    });

    socket.on('timeout', () => {
      console.log(`🟢 Puerto ${port} disponible en ${host} (timeout)`);
      socket.destroy();
      resolve(false); // Puerto disponible
    });

    socket.on('error', () => {
      console.log(`🟢 Puerto ${port} disponible en ${host} (error de conexión)`);
      resolve(false); // Puerto disponible
    });

    socket.connect(port, host);
  });
}