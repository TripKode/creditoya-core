import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import DecryptJson from 'handlers/decryptJson';
import { PrismaService } from '../prisma/prisma.service';
import {
  BackupInfo,
  BackupResponse,
  DownloadUrlResponse,
  ListBackupsResponse
} from './dto/create-backup.dto';

const gzipPromise = promisify(zlib.gzip);
const gunzipPromise = promisify(zlib.gunzip);
const writeFilePromise = promisify(fs.writeFile);
const readFilePromise = promisify(fs.readFile);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private storage: Storage | null = null;

  constructor(private readonly prismaService: PrismaService) { }

  /**
   * Crea una instancia de Storage utilizando las credenciales desencriptadas.
   * Implementa un patrón singleton para evitar crear múltiples instancias.
   */
  private async getStorageInstance(): Promise<Storage> {
    if (this.storage) {
      return this.storage;
    }

    // Use path.resolve to get an absolute path to the credentials file
    const credentialPath = path.resolve(process.cwd(), 'jsons', 'cloud.json');

    // Load the credential file dynamically
    let credentialObj: { k: string } | null;
    try {
      credentialObj = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
      this.logger.log('Credential object loaded successfully');
    } catch (error) {
      this.logger.error(`Failed to load credential file from ${credentialPath}`, error);
      throw new Error('Cloud credentials file could not be loaded');
    }

    // Check if the credential has the expected structure
    if (!credentialObj || !credentialObj.k) {
      this.logger.error('Cloud credentials are missing the required "k" property');
      throw new Error('Invalid cloud credential format - missing "k" property');
    }

    const EnCredential = credentialObj.k;
    const decryptedCredentials = DecryptJson({
      encryptedData: EnCredential,
      password: process.env.KEY_DECRYPT as string,
    });

    this.storage = new Storage({
      projectId: process.env.PROJECT_ID_GOOGLE,
      credentials: decryptedCredentials,
    });

    // Check if bucket exists and create it if it doesn't
    const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;
    try {
      const [exists] = await this.storage.bucket(bucketName).exists();
      if (!exists) {
        this.logger.log(`Bucket ${bucketName} does not exist. Creating it now...`);
        await this.storage.createBucket(bucketName, {
          location: 'us-central1',
          storageClass: 'STANDARD',
        });
        this.logger.log(`Bucket ${bucketName} created successfully`);
      }
    } catch (error) {
      this.logger.error(`Error checking/creating bucket ${bucketName}:`, error);
      throw new Error(`Failed to access or create storage bucket: ${bucketName}`);
    }

    return this.storage;
  }

  /**
   * Ejecuta un backup de la base de datos MongoDB usando Prisma cada mes
   * Se ejecuta el primer día de cada mes a las 2:00 AM
   */
  @Cron('0 2 1 * *') // First day of the month at 2:00 AM
  async runMonthlyBackup(): Promise<BackupResponse> {
    this.logger.log('Iniciando backup mensual de la base de datos MongoDB con Prisma...');

    try {
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

      // Extraer el nombre de la base de datos desde la URL de conexión
      const mongoUrl = process.env.MONGODB_URI || process.env.DATABASE_URL || '';
      const databaseName = mongoUrl ? new URL(mongoUrl).pathname.substring(1) : 'unknown_database';

      // Ejecutar backup utilizando las funciones nativas de Prisma para MongoDB
      this.logger.log('Exportando datos con Prisma para MongoDB...');
      try {
        // Obtener todos los modelos/colecciones desde MongoDB
        const collections = await this.getMongoCollections();

        // Hacer una consulta para cada colección y guardarlos en un objeto
        const backupData: Record<string, any[]> = {};

        for (const collection of collections) {
          this.logger.log(`Exportando datos de la colección: ${collection}`);

          const result = await this.prismaService.$runCommandRaw({
            find: collection,
            limit: 0
          });

          let data: any[] = [];
          // Usar una verificación más segura
          if (result && typeof result === 'object' && 'cursor' in result &&
            result.cursor && typeof result.cursor === 'object' && 'firstBatch' in result.cursor &&
            Array.isArray(result.cursor.firstBatch)) {
            data = result.cursor.firstBatch as any[];
          }

          backupData[collection] = data;
          this.logger.log(`Exportados ${data.length} documentos de la colección ${collection}`);
        }

        // Convertir a JSON y comprimir
        const jsonData = JSON.stringify(backupData, null, 2);
        const compressedData = await gzipPromise(Buffer.from(jsonData, 'utf-8'));

        // Guardar en archivo temporal
        await writeFilePromise(backupFilePath, compressedData);

        this.logger.log(`Backup generado exitosamente: ${backupFilePath}`);
      } catch (dumpError) {
        this.logger.error('Error al crear el backup con Prisma:', dumpError);
        throw new Error(`Error al exportar datos: ${dumpError.message}`);
      }

      // Subir archivo de backup a Google Cloud Storage
      this.logger.log('Subiendo backup a Google Cloud Storage...');

      const storage = await this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;

      try {
        await storage
          .bucket(bucketName)
          .upload(backupFilePath, {
            destination: storageDestinationPath,
            metadata: {
              contentType: 'application/gzip',
              metadata: {
                database: databaseName,
                type: 'prisma-mongodb-backup',
                createdBy: 'automated-system'
              }
            },
          });
      } catch (uploadError) {
        this.logger.error('Error al subir el backup a Google Cloud Storage:', uploadError);
        throw new Error(`Error al subir el backup: ${uploadError.message}`);
      }

      this.logger.log(`Backup subido exitosamente a gs://${bucketName}/${storageDestinationPath}`);

      // Limpiar archivo temporal
      try {
        fs.unlinkSync(backupFilePath);
        this.logger.log('Archivo temporal eliminado');
      } catch (unlinkError) {
        this.logger.warn('No se pudo eliminar el archivo temporal:', unlinkError);
        // Continuamos con la ejecución aunque no se pueda borrar el archivo temporal
      }

      // Implementar retención de backups: eliminar backups más antiguos de 1 año
      await this.cleanOldBackups().catch(error => {
        this.logger.warn('Error durante la limpieza de backups antiguos:', error);
        // Continuamos con la ejecución aunque falle la limpieza
      });

      return {
        success: true,
        message: `Backup completado y almacenado en gs://${bucketName}/${storageDestinationPath}`,
        path: storageDestinationPath
      };
    } catch (error) {
      this.logger.error('Error durante el proceso de backup:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido durante el backup',
      };
    }
  }

  /**
   * Obtiene las colecciones disponibles en MongoDB
   * Utiliza el acceso directo al cliente MongoDB subyacente de Prisma
   */
  private async getMongoCollections(): Promise<string[]> {
    try {
      // Acceder al cliente MongoDB directamente usando $runCommandRaw
      const result = await this.prismaService.$runCommandRaw({
        listCollections: 1,
      });

      // Extraer nombres de colecciones del resultado
      if (result && Array.isArray((result as any).cursor?.firstBatch)) {
        return (result as { cursor: { firstBatch: { name: string }[] } }).cursor.firstBatch.map(col => col.name);
      }

      throw new Error('No se pudo obtener la lista de colecciones');
    } catch (error) {
      this.logger.error('Error al obtener las colecciones de MongoDB:', error);

      // Plan alternativo: lista de modelos de tu schema.prisma
      this.logger.warn('Usando lista de colecciones predefinida como último recurso');

      // Esta lista debe coincidir con tus modelos en schema.prisma
      return [
        'User',
        'Document',
        'UsersIntranet',
        'LoanApplication',
        'GeneratedDocuments',
        'WhatsappSession',
        'ReportIssue'
      ].map(model => model.toLowerCase());
    }
  }

  /**
   * Limpia backups antiguos (más de 1 año)
   */
  private async cleanOldBackups(): Promise<void> {
    try {
      const storage = await this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      this.logger.log('Buscando backups antiguos para eliminar...');

      // Listar archivos en el directorio de backups
      const [files] = await storage
        .bucket(bucketName)
        .getFiles({ prefix: 'database_backups/' });

      const deletePromises: Promise<void>[] = [];
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const createTime = new Date(metadata.timeCreated ?? 0);

        // Eliminar si es más antiguo que un año
        if (createTime < oneYearAgo) {
          this.logger.log(`Eliminando backup antiguo: ${file.name}`);
          deletePromises.push(file.delete().then(() => undefined));
        }
      }

      // Esperar a que todas las eliminaciones se completen
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        this.logger.log(`Se eliminaron ${deletePromises.length} backups antiguos`);
      } else {
        this.logger.log('No se encontraron backups antiguos para eliminar');
      }
    } catch (error) {
      this.logger.error('Error al limpiar backups antiguos:', error);
      throw error; // Reenviar el error para manejo superior
    }
  }

  /**
   * Método para ejecutar un backup inmediato (puede ser llamado por una API)
   */
  async createBackupNow(): Promise<BackupResponse> {
    try {
      return await this.runMonthlyBackup();
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
      const storage = await this.getStorageInstance();
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
        const sizeInMB = (parseInt(String(metadata.size || '0')) / (1024 * 1024)).toFixed(2);

        return {
          name: file.name,
          timeCreated: metadata.timeCreated || 'Unknown',
          size: `${sizeInMB} MB`,
        };
      }));

      // Ordenar por fecha de creación, el más reciente primero
      backups.sort((a, b) =>
        new Date(b.timeCreated).getTime() - new Date(a.timeCreated).getTime()
      );

      return {
        success: true,
        backups,
        message: `Se encontraron ${backups.length} backups disponibles`
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
    if (!backupPath) {
      return {
        success: false,
        message: 'Ruta de backup no especificada'
      };
    }

    try {
      this.logger.log(`Iniciando restauración desde backup: ${backupPath}`);

      // Crear directorio temporal si no existe
      const tempDir = path.join(process.cwd(), 'temp_backups');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const localFilePath = path.join(tempDir, path.basename(backupPath));
      const storage = await this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;

      // Verificar si el archivo existe en el bucket
      try {
        const [exists] = await storage.bucket(bucketName).file(backupPath).exists();
        if (!exists) {
          return {
            success: false,
            message: `El archivo de backup no existe en gs://${bucketName}/${backupPath}`
          };
        }
      } catch (checkError) {
        this.logger.error('Error al verificar existencia del backup:', checkError);
        return {
          success: false,
          message: `Error al verificar el archivo de backup: ${checkError instanceof Error ? checkError.message : 'Error desconocido'}`
        };
      }

      // Descargar archivo de backup
      this.logger.log('Descargando archivo de backup de Google Cloud Storage...');
      try {
        await storage
          .bucket(bucketName)
          .file(backupPath)
          .download({ destination: localFilePath });
      } catch (downloadError) {
        this.logger.error('Error al descargar el archivo de backup:', downloadError);
        return {
          success: false,
          message: `Error al descargar el backup: ${downloadError instanceof Error ? downloadError.message : 'Error desconocido'}`
        };
      }

      // Descomprimir y leer el archivo
      const compressedData = await readFilePromise(localFilePath);
      const jsonData = await gunzipPromise(compressedData);
      const backupData = JSON.parse(jsonData.toString('utf8'));

      // Cerrar conexión antes de restaurar
      this.logger.log('Cerrando conexión de Prisma antes de la restauración...');
      await this.prismaService.$disconnect();

      try {
        // Establecer nueva conexión
        await this.prismaService.$connect();

        // Restaurar datos para cada colección
        await this.prismaService.$transaction(async (prisma) => {
          // @ts-ignore - Accedemos al cliente MongoDB subyacente
          const db = prisma._baseDmmf.containerEngine.client.db();

          // Obtener colecciones del backup
          const collections = Object.keys(backupData);

          for (const collection of collections) {
            this.logger.log(`Restaurando datos para la colección: ${collection}`);

            // Eliminar datos existentes
            await db.collection(collection).deleteMany({});

            // Insertar datos del backup
            const collectionData = backupData[collection];
            if (Array.isArray(collectionData) && collectionData.length > 0) {
              // Si hay muchos documentos, dividir en lotes para mejorar rendimiento
              const batchSize = 1000;
              for (let i = 0; i < collectionData.length; i += batchSize) {
                const batch = collectionData.slice(i, i + batchSize);
                if (batch.length > 0) {
                  await db.collection(collection).insertMany(batch, { ordered: false });
                }
              }

              this.logger.log(`Insertados ${collectionData.length} documentos en ${collection}`);
            }
          }
        }, {
          // Opciones de transacción para MongoDB - máxima duración
          maxWait: 60000, // 60 segundos
          timeout: 120000 // 120 segundos
        });

      } catch (restoreError) {
        this.logger.error('Error durante la restauración de datos:', restoreError);

        // Intentar reconectar Prisma después del error
        try {
          await this.prismaService.$connect();
        } catch (connError) {
          this.logger.error('Error al reconectar Prisma después del fallo:', connError);
        }

        return {
          success: false,
          message: `Error al restaurar la base de datos: ${restoreError instanceof Error ? restoreError.message : 'Error desconocido'}`
        };
      }

      // Eliminar archivo temporal
      try {
        fs.unlinkSync(localFilePath);
      } catch (unlinkError) {
        this.logger.warn('No se pudo eliminar el archivo temporal:', unlinkError);
        // Continuamos aunque no se pueda borrar el archivo
      }

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
    if (!backupPath) {
      return {
        success: false,
        message: 'Ruta de backup no especificada'
      };
    }

    try {
      const storage = await this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;

      // Verificar si el archivo existe
      const [exists] = await storage.bucket(bucketName).file(backupPath).exists();
      if (!exists) {
        return {
          success: false,
          message: `El archivo de backup no existe en gs://${bucketName}/${backupPath}`
        };
      }

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
        downloadUrl: url,
        expiresIn: '15 minutos'
      };
    } catch (error) {
      this.logger.error('Error al generar URL de descarga:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error al generar URL de descarga'
      };
    }
  }
}