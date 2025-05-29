import * as net from 'net';

/**
 * Función para verificar si un puerto está realmente ocupado
 * Adaptada para manejar diferentes hosts según el entorno
 */
export function checkPortStatus(port: number, host: string = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    // Timeout más largo para entornos de producción
    const timeout = host === '0.0.0.0' ? 3000 : 1000;
    socket.setTimeout(timeout);

    socket.on('connect', () => {
      console.log(`🔴 Puerto ${port} está OCUPADO en ${host}`);
      socket.destroy();
      resolve(true); // Puerto ocupado
    });

    socket.on('timeout', () => {
      console.log(`🟢 Puerto ${port} disponible en ${host} (timeout después de ${timeout}ms)`);
      socket.destroy();
      resolve(false); // Puerto disponible
    });

    socket.on('error', (error: any) => {
      // Diferentes tipos de error indican puerto disponible
      if (error.code === 'ECONNREFUSED' ||
        error.code === 'EHOSTUNREACH' ||
        error.code === 'ENETUNREACH') {
        console.log(`🟢 Puerto ${port} disponible en ${host} (${error.code})`);
        resolve(false); // Puerto disponible
      } else {
        console.log(`⚠️ Error inesperado verificando puerto ${port} en ${host}: ${error.code || error.message}`);
        resolve(false); // Asumimos disponible en caso de error desconocido
      }
    });

    try {
      socket.connect(port, host);
    } catch (error) {
      console.log(`🟢 Puerto ${port} disponible en ${host} (excepción al conectar)`);
      resolve(false); // Puerto disponible
    }
  });
}

/**
 * Función auxiliar para verificar múltiples combinaciones de host/puerto
 * Útil para entornos de desarrollo donde queremos asegurar que el puerto esté libre en todas las interfaces
 */
export async function checkMultiplePortStatus(port: number, hosts: string[] = ['127.0.0.1', '0.0.0.0']): Promise<{ host: string, occupied: boolean }[]> {
  const results: { host: string, occupied: boolean }[] = [];

  for (const host of hosts) {
    const occupied = await checkPortStatus(port, host);
    results.push({ host, occupied });
  }

  return results;
}

/**
 * Función para encontrar un puerto disponible en un rango
 * Útil como fallback si el puerto preferido está ocupado
 */
export async function findAvailablePort(
  startPort: number,
  endPort: number,
  host: string = '127.0.0.1'
): Promise<number | null> {

  console.log(`🔍 Buscando puerto disponible entre ${startPort} y ${endPort} en ${host}`);

  for (let port = startPort; port <= endPort; port++) {
    const isOccupied = await checkPortStatus(port, host);
    if (!isOccupied) {
      console.log(`✅ Puerto ${port} encontrado disponible en ${host}`);
      return port;
    }
  }

  console.log(`❌ No se encontró ningún puerto disponible entre ${startPort} y ${endPort} en ${host}`);
  return null;
}