// handlers/main/CheckPorts.ts
import * as net from 'net';
import { LoggerService } from '../../src/common/logger/logger.service';

// Crear instancia del logger para este módulo
const logger = new LoggerService('PortChecker');

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

    logger.debug(`🔍 Verificando puerto ${port} en ${host}`, {
      port,
      host,
      timeout,
      event: 'port_check_start'
    });

    socket.on('connect', () => {
      logger.logPortCheck(port, host, true);
      socket.destroy();
      resolve(true); // Puerto ocupado
    });

    socket.on('timeout', () => {
      logger.debug(`🟢 Puerto ${port} disponible en ${host} (timeout después de ${timeout}ms)`, {
        port,
        host,
        timeout,
        reason: 'timeout',
        event: 'port_available'
      });
      socket.destroy();
      resolve(false); // Puerto disponible
    });

    socket.on('error', (error: any) => {
      // Diferentes tipos de error indican puerto disponible
      if (error.code === 'ECONNREFUSED' ||
        error.code === 'EHOSTUNREACH' ||
        error.code === 'ENETUNREACH') {

        logger.debug(`🟢 Puerto ${port} disponible en ${host} (${error.code})`, {
          port,
          host,
          errorCode: error.code,
          reason: 'connection_refused',
          event: 'port_available'
        });
        resolve(false); // Puerto disponible
      } else {
        logger.warn(`⚠️ Error inesperado verificando puerto ${port} en ${host}`, {
          port,
          host,
          errorCode: error.code,
          errorMessage: error.message,
          event: 'port_check_unexpected_error'
        });
        resolve(false); // Asumimos disponible en caso de error desconocido
      }
    });

    try {
      socket.connect(port, host);
    } catch (error) {
      logger.debug(`🟢 Puerto ${port} disponible en ${host} (excepción al conectar)`, {
        port,
        host,
        error: error instanceof Error ? error.message : String(error),
        reason: 'connection_exception',
        event: 'port_available'
      });
      resolve(false); // Puerto disponible
    }
  });
}

/**
 * Función auxiliar para verificar múltiples combinaciones de host/puerto
 * Útil para entornos de desarrollo donde queremos asegurar que el puerto esté libre en todas las interfaces
 */
export async function checkMultiplePortStatus(
  port: number,
  hosts: string[] = ['127.0.0.1', '0.0.0.0']
): Promise<{ host: string, occupied: boolean }[]> {
  const results: { host: string, occupied: boolean }[] = [];

  logger.info(`🔍 Verificando puerto ${port} en múltiples hosts`, {
    port,
    hosts,
    hostCount: hosts.length,
    event: 'multiple_port_check_start'
  });

  for (const host of hosts) {
    const occupied = await checkPortStatus(port, host);
    results.push({ host, occupied });

    logger.debug(`📊 Resultado para ${host}: ${occupied ? 'OCUPADO' : 'LIBRE'}`, {
      port,
      host,
      occupied,
      event: 'multiple_port_check_result'
    });
  }

  const occupiedHosts = results.filter(r => r.occupied);
  if (occupiedHosts.length > 0) {
    logger.warn(`⚠️ Puerto ${port} ocupado en ${occupiedHosts.length} host(s)`, {
      port,
      occupiedHosts: occupiedHosts.map(r => r.host),
      totalHosts: hosts.length,
      event: 'multiple_port_check_occupied'
    });
  } else {
    logger.info(`✅ Puerto ${port} disponible en todos los hosts verificados`, {
      port,
      hosts,
      event: 'multiple_port_check_all_free'
    });
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
  logger.info(`🔍 Buscando puerto disponible entre ${startPort} y ${endPort} en ${host}`, {
    startPort,
    endPort,
    host,
    range: endPort - startPort + 1,
    event: 'find_available_port_start'
  });

  for (let port = startPort; port <= endPort; port++) {
    const isOccupied = await checkPortStatus(port, host);
    if (!isOccupied) {
      logger.info(`✅ Puerto ${port} encontrado disponible en ${host}`, {
        port,
        host,
        searchRange: `${startPort}-${endPort}`,
        event: 'available_port_found'
      });
      return port;
    }
  }

  logger.error(`❌ No se encontró ningún puerto disponible entre ${startPort} y ${endPort} en ${host}`, {
    startPort,
    endPort,
    host,
    searchedPorts: endPort - startPort + 1,
    event: 'no_available_port_found'
  });

  return null;
}