import * as net from 'net';
import { Logger } from '@nestjs/common';

// Logger estático para funciones utilitarias
const logger = new Logger('PortChecker');

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
      logger.verbose(`🔴 Puerto ${port} OCUPADO en ${host}`);
      socket.destroy();
      resolve(true); // Puerto ocupado
    });

    socket.on('timeout', () => {
      logger.debug(`🟢 Puerto ${port} disponible en ${host} (timeout después de ${timeout}ms)`);
      socket.destroy();
      resolve(false); // Puerto disponible
    });

    socket.on('error', (error: any) => {
      // Diferentes tipos de error indican puerto disponible
      if (error.code === 'ECONNREFUSED' ||
        error.code === 'EHOSTUNREACH' ||
        error.code === 'ENETUNREACH') {

        logger.debug(`🟢 Puerto ${port} disponible en ${host} (${error.code})`);
        resolve(false); // Puerto disponible
      } else {
        logger.warn(`⚠️ Error inesperado verificando puerto ${port} en ${host}: ${error.code} - ${error.message}`);
        resolve(false); // Asumimos disponible en caso de error desconocido
      }
    });

    try {
      socket.connect(port, host);
    } catch (error) {
      logger.debug(`🟢 Puerto ${port} disponible en ${host} (excepción al conectar): ${error instanceof Error ? error.message : String(error)}`);
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

  logger.log(`🔍 Verificando puerto ${port} en múltiples hosts: ${hosts.join(', ')}`);

  for (const host of hosts) {
    const occupied = await checkPortStatus(port, host);
    results.push({ host, occupied });

    logger.debug(`📊 Resultado para ${host}: ${occupied ? 'OCUPADO' : 'LIBRE'}`);
  }

  const occupiedHosts = results.filter(r => r.occupied);
  if (occupiedHosts.length > 0) {
    logger.warn(`⚠️ Puerto ${port} ocupado en ${occupiedHosts.length} host(s): ${occupiedHosts.map(r => r.host).join(', ')}`);
  } else {
    logger.log(`✅ Puerto ${port} disponible en todos los hosts verificados`);
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
  logger.log(`🔍 Buscando puerto disponible entre ${startPort} y ${endPort} en ${host}`);

  for (let port = startPort; port <= endPort; port++) {
    const isOccupied = await checkPortStatus(port, host);
    if (!isOccupied) {
      logger.log(`✅ Puerto ${port} encontrado disponible en ${host}`);
      return port;
    }
  }

  logger.error(`❌ No se encontró ningún puerto disponible entre ${startPort} y ${endPort} en ${host}`);
  return null;
}

/**
 * Clase de servicio para uso dentro de módulos NestJS
 * Permite inyectar el servicio y usar logger contextualizado
 */
export class PortCheckerService {
  private readonly logger = new Logger(PortCheckerService.name);

  /**
   * Verifica si un puerto está ocupado
   */
  async checkPortStatus(port: number, host: string = '127.0.0.1'): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = host === '0.0.0.0' ? 3000 : 1000;
      socket.setTimeout(timeout);

      this.logger.debug(`🔍 Verificando puerto ${port} en ${host}`, {
        port,
        host,
        timeout
      });

      socket.on('connect', () => {
        this.logger.verbose(`🔴 Puerto ${port} OCUPADO en ${host}`);
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        this.logger.debug(`🟢 Puerto ${port} disponible en ${host} (timeout)`);
        socket.destroy();
        resolve(false);
      });

      socket.on('error', (error: any) => {
        if (error.code === 'ECONNREFUSED' ||
          error.code === 'EHOSTUNREACH' ||
          error.code === 'ENETUNREACH') {
          this.logger.debug(`🟢 Puerto ${port} disponible en ${host} (${error.code})`);
          resolve(false);
        } else {
          this.logger.warn(`⚠️ Error inesperado verificando puerto ${port}: ${error.code}`);
          resolve(false);
        }
      });

      try {
        socket.connect(port, host);
      } catch (error) {
        this.logger.debug(`🟢 Puerto ${port} disponible (excepción): ${error instanceof Error ? error.message : String(error)}`);
        resolve(false);
      }
    });
  }

  /**
   * Verifica múltiples hosts
   */
  async checkMultiplePortStatus(
    port: number,
    hosts: string[] = ['127.0.0.1', '0.0.0.0']
  ): Promise<{ host: string, occupied: boolean }[]> {
    const results: { host: string, occupied: boolean }[] = [];

    this.logger.log(`🔍 Verificando puerto ${port} en múltiples hosts: ${hosts.join(', ')}`);

    for (const host of hosts) {
      const occupied = await this.checkPortStatus(port, host);
      results.push({ host, occupied });
      this.logger.debug(`📊 ${host}: ${occupied ? 'OCUPADO' : 'LIBRE'}`);
    }

    const occupiedHosts = results.filter(r => r.occupied);
    if (occupiedHosts.length > 0) {
      this.logger.warn(`⚠️ Puerto ${port} ocupado en: ${occupiedHosts.map(r => r.host).join(', ')}`);
    } else {
      this.logger.log(`✅ Puerto ${port} disponible en todos los hosts`);
    }

    return results;
  }

  /**
   * Encuentra un puerto disponible en un rango
   */
  async findAvailablePort(
    startPort: number,
    endPort: number,
    host: string = '127.0.0.1'
  ): Promise<number | null> {
    this.logger.log(`🔍 Buscando puerto disponible entre ${startPort}-${endPort} en ${host}`);

    for (let port = startPort; port <= endPort; port++) {
      const isOccupied = await this.checkPortStatus(port, host);
      if (!isOccupied) {
        this.logger.log(`✅ Puerto ${port} encontrado disponible en ${host}`);
        return port;
      }
    }

    this.logger.error(`❌ No se encontró puerto disponible entre ${startPort}-${endPort} en ${host}`);
    return null;
  }

  /**
   * Verifica si el puerto de la aplicación está disponible
   * Útil para verificar antes de iniciar el servidor
   */
  async checkApplicationPort(port: number): Promise<void> {
    const hosts = ['127.0.0.1', '0.0.0.0'];
    const results = await this.checkMultiplePortStatus(port, hosts);

    const occupiedHosts = results.filter(r => r.occupied);
    if (occupiedHosts.length > 0) {
      const message = `Puerto ${port} ocupado en: ${occupiedHosts.map(r => r.host).join(', ')}`;
      this.logger.error(`❌ ${message}`);
      throw new Error(message);
    }

    this.logger.log(`✅ Puerto ${port} disponible para la aplicación`);
  }
}