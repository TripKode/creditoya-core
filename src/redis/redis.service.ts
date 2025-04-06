import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private redisClient: Redis;
  private defaultTTL: number = 3600; // 1 hora en segundos

  constructor(private configService: ConfigService) { }

  onModuleInit() {
    // Conexión a Redis usando ConfigService para obtener las variables de entorno
    this.redisClient = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD', ''),
      db: this.configService.get<number>('REDIS_DB', 0),
    });

    this.redisClient.on('error', (error) => {
      console.error('Error en la conexión Redis:', error);
    });

    console.log('Servicio Redis inicializado correctamente');
  }

  onModuleDestroy() {
    this.redisClient.disconnect();
    console.log('Conexión Redis cerrada correctamente');
  }

  /**
   * Obtiene un valor de la caché
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redisClient.get(key);

    if (value) {
      try {
        return JSON.parse(value) as T;
      } catch (error) {
        console.error('Error al parsear el valor de Redis:', error);
        return null;
      }
    }

    return null;
  }

  /**
   * Guarda un valor en la caché
   */
  async set(key: string, value: any, ttl: number = this.defaultTTL): Promise<void> {
    await this.redisClient.set(
      key,
      JSON.stringify(value),
      'EX',
      ttl
    );
  }

  /**
   * Elimina un valor de la caché
   */
  async del(key: string): Promise<void> {
    await this.redisClient.del(key);
  }

  /**
   * Elimina múltiples valores que coincidan con un patrón
   */
  async delByPattern(pattern: string): Promise<void> {
    const keys = await this.redisClient.keys(pattern);

    if (keys.length > 0) {
      await this.redisClient.del(...keys);
    }
  }

  /**
   * Obtiene datos de la caché o los almacena si no existen
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    // Intentar obtener de la caché primero
    const cachedValue = await this.get<T>(key);

    if (cachedValue !== null) {
      return cachedValue;
    }

    // Si no está en caché, obtener datos frescos
    const freshData = await fetchFn();

    // Guardar en caché para futuras peticiones
    await this.set(key, freshData, ttl);

    return freshData;
  }
}
