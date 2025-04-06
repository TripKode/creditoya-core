import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Storage } from '@google-cloud/storage';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import credential from '../../jsons/cloud.json';
import DecryptJson from 'handlers/decryptJson';
import { PrismaService } from '../prisma/prisma.service';
import { BackupInfo, BackupResponse, DownloadUrlResponse, ListBackupsResponse } from './dto/create-backup.dto';

const execPromise = promisify(exec);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(private readonly prismaService: PrismaService) { }

  /**
   * Crea una instancia de Storage utilizando las credenciales desencriptadas.
   */
  private getStorageInstance(): Storage {
    const EnCredential = credential.k;
    const decryptedCredentials = DecryptJson({
      encryptedData: EnCredential,
      password: process.env.KEY_DECRYPT as string,
    });

    return new Storage({
      projectId: process.env.PROJECT_ID_GOOGLE,
      credentials: decryptedCredentials,
    });
  }

  /**
   * Ejecuta un backup de la base de datos MongoDB cada mes
   * Se ejecuta el primer día de cada mes a las 2:00 AM
   */
  @Cron('0 2 1 * *') // First day of the month at 2:00 AM
  async runMonthlyBackup(): Promise<BackupResponse> {
    this.logger.log('Iniciando backup mensual de la base de datos MongoDB...');

    try {
      // Verificar conexión a la base de datos
      await this.prismaService.$connect();
      this.logger.log('Conexión a la base de datos verificada');

      // Crear directorio temporal para el backup si no existe
      const tempDir = path.join(process.cwd(), 'temp_backups');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Generar nombre de archivo con timestamp y nomenclatura estructurada
      const now = new Date();
      const timestamp = now.toISOString().replace(/:/g, '-');
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');

      // Formato: año/mes/mongodb_backup_YYYY-MM-DD...
      const backupFileName = `mongodb_backup_${timestamp}.gz`;
      const backupFilePath = path.join(tempDir, backupFileName);
      const storageDestinationPath = `database_backups/${year}/${month}/${backupFileName}`;

      // Obtener URI de MongoDB desde las variables de entorno
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MONGODB_URI no está definido en las variables de entorno');
      }

      // Ejecutar mongodump para crear el backup
      this.logger.log('Ejecutando mongodump...');
      await execPromise(
        `mongodump --uri="${mongoUri}" --gzip --archive="${backupFilePath}"`,
      );

      // Subir archivo de backup a Google Cloud Storage
      this.logger.log(`Backup creado exitosamente: ${backupFilePath}`);
      this.logger.log('Subiendo backup a Google Cloud Storage...');

      const storage = this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;

      await storage
        .bucket(bucketName)
        .upload(backupFilePath, {
          destination: storageDestinationPath,
          metadata: {
            contentType: 'application/gzip',
            metadata: {
              database: new URL(mongoUri).pathname.substring(1), // Extraer nombre de la DB
              type: 'full-backup',
              createdBy: 'automated-system'
            }
          },
        });

      this.logger.log(`Backup subido exitosamente a gs://${bucketName}/${storageDestinationPath}`);

      // Limpiar archivo temporal
      fs.unlinkSync(backupFilePath);
      this.logger.log('Archivo temporal eliminado');

      // Implementar retención de backups (opcional): eliminar backups más antiguos de 1 año
      await this.cleanOldBackups();

      return {
        success: true,
        message: `Backup completado y almacenado en gs://${bucketName}/${storageDestinationPath}`,
        path: storageDestinationPath
      };
    } catch (error) {
      this.logger.error('Error durante el proceso de backup:', error);
      throw error;
    }
  }

  /**
   * Limpia backups antiguos (más de 1 año)
   */
  private async cleanOldBackups(): Promise<void> {
    try {
      const storage = this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      this.logger.log('Buscando backups antiguos para eliminar...');

      // Listar archivos en el directorio de backups
      const [files] = await storage
        .bucket(bucketName)
        .getFiles({ prefix: 'database_backups/' });

      for (const file of files) {
        const metadata = await file.getMetadata();
        const createTime = new Date(metadata[0].timeCreated ?? 0);

        // Eliminar si es más antiguo que un año
        if (createTime < oneYearAgo) {
          this.logger.log(`Eliminando backup antiguo: ${file.name}`);
          await file.delete();
        }
      }

      this.logger.log('Limpieza de backups antiguos completada');
    } catch (error) {
      this.logger.error('Error al limpiar backups antiguos:', error);
    }
  }

  /**
   * Método para ejecutar un backup inmediato (puede ser llamado por una API)
   */
  async createBackupNow(): Promise<BackupResponse> {
    try {
      const result = await this.runMonthlyBackup();
      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Método para listar todos los backups disponibles
   */
  async listAvailableBackups(): Promise<ListBackupsResponse> {
    try {
      const storage = this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;

      const [files] = await storage
        .bucket(bucketName)
        .getFiles({ prefix: 'database_backups/' });

      if (files.length === 0) {
        return {
          success: true,
          backups: [],
          message: 'No se encontraron backups disponibles'
        };
      }

      const backups: BackupInfo[] = await Promise.all(files.map(async (file) => {
        const [metadata] = await file.getMetadata();
        return {
          name: file.name,
          timeCreated: metadata.timeCreated || 'Unknown', // Provide a default value
          size: (parseInt(String(metadata.size || '0')) / (1024 * 1024)).toFixed(2) + ' MB',
        };
      }));

      // Ordenar por fecha de creación, el más reciente primero
      backups.sort((a, b) =>
        new Date(b.timeCreated).getTime() - new Date(a.timeCreated).getTime()
      );

      return {
        success: true,
        backups
      };
    } catch (error) {
      this.logger.error('Error al listar backups:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Método para restaurar un backup específico
   * @param backupPath Ruta del archivo de backup en Google Cloud Storage
   */
  async restoreFromBackup(backupPath: string): Promise<BackupResponse> {
    try {
      this.logger.log(`Iniciando restauración desde backup: ${backupPath}`);

      // Crear directorio temporal si no existe
      const tempDir = path.join(process.cwd(), 'temp_backups');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const localFilePath = path.join(tempDir, path.basename(backupPath));
      const storage = this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;

      // Descargar archivo de backup
      this.logger.log('Descargando archivo de backup de Google Cloud Storage...');
      await storage
        .bucket(bucketName)
        .file(backupPath)
        .download({ destination: localFilePath });

      // Obtener URI de MongoDB
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error('MONGODB_URI no está definido en las variables de entorno');
      }

      // Cerrar conexión de Prisma antes de restaurar
      this.logger.log('Cerrando conexión de Prisma antes de la restauración...');
      await this.prismaService.$disconnect();

      // Ejecutar mongorestore para restaurar el backup
      this.logger.log('Ejecutando mongorestore...');
      await execPromise(
        `mongorestore --uri="${mongoUri}" --gzip --archive="${localFilePath}" --drop`,
      );

      // Eliminar archivo temporal
      fs.unlinkSync(localFilePath);

      // Reconectar Prisma después de la restauración
      await this.prismaService.$connect();

      return {
        success: true,
        message: 'Base de datos restaurada exitosamente desde el backup'
      };
    } catch (error) {
      this.logger.error('Error durante la restauración:', error);

      // Intentar reconectar Prisma en caso de error
      try {
        await this.prismaService.$connect();
      } catch (connError) {
        this.logger.error('Error al reconectar Prisma:', connError);
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido durante la restauración'
      };
    }
  }

  /**
   * Genera una URL firmada para descargar un backup específico
   * @param backupPath Ruta del archivo de backup en Google Cloud Storage
   */
  async generateBackupDownloadUrl(backupPath: string): Promise<DownloadUrlResponse> {
    try {
      const storage = this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;

      const [url] = await storage
        .bucket(bucketName)
        .file(backupPath)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 15 * 60 * 1000, // URL válida por 15 minutos
        });

      return {
        success: true,
        downloadUrl: url
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error al generar URL de descarga'
      };
    }
  }
}