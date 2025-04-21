import { Inject, Injectable, Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import DecryptJson from 'handlers/decryptJson';
import { CREDENTIAL_GCP, GpcTypes } from 'templates/cloud';

export interface PropsUpload {
  file: Express.Multer.File;
  userId: string;
  name: string;
  upId: string;
  contentType?: string
  isBackup?: boolean;
}

export interface PropsDelete {
  type: string;
  userId: string;
  upId: string;
  contentType?: string
}

@Injectable()
export class GoogleCloudService {
  private readonly logger = new Logger(GoogleCloudService.name);

  constructor(
    @Inject(CREDENTIAL_GCP)
    private readonly credential: GpcTypes,
  ) { }

  /**
   * Crea una instancia de Storage utilizando las credenciales desencriptadas.
   */
  private getStorageInstance(): Storage {
    this.logger.log('Iniciando obtención de instancia de Storage');
    try {
      const EnCredential = this.credential.k;
      this.logger.log('Credenciales obtenidas, procediendo a desencriptar');

      const decryptedCredentials = DecryptJson({
        encryptedData: EnCredential,
        password: process.env.KEY_DECRYPT as string,
      });

      this.logger.log('Credenciales desencriptadas correctamente');

      const storage = new Storage({
        projectId: process.env.PROJECT_ID_GOOGLE,
        credentials: decryptedCredentials,
      });

      this.logger.log('Instancia de Storage creada exitosamente');
      return storage;
    } catch (error) {
      this.logger.error('Error al obtener instancia de Storage:', error);
      throw error;
    }
  }

  /**
   * Sube un archivo a Google Cloud Storage.
   * @param param0 Datos necesarios para subir el archivo.
   * @returns Un objeto indicando el éxito y el nombre público del archivo.
   */
  /**
   * Sube un archivo a Google Cloud Storage.
   * @param param0 Datos necesarios para subir el archivo.
   * @returns Un objeto indicando el éxito y el nombre público del archivo.
   * @throws Error si falla la subida del archivo
   */
  async uploadToGcs({
    file,
    userId,
    name,
    upId,
    contentType,
    isBackup = false,
  }: PropsUpload): Promise<{ success: boolean; public_name: string }> {
    // Validaciones iniciales con mensajes de error específicos
    if (!file) {
      this.logger.error('Error: No se proporcionó un archivo');
      throw new Error('No se proporcionó un archivo');
    }

    if (!file.buffer || file.size < 1) {
      this.logger.error('Error: El archivo está vacío o no tiene buffer');
      throw new Error('El archivo está vacío o inválido');
    }

    try {
      // Determinar el bucket correcto
      const bucketName = isBackup
        ? process.env.NAME_BUCKET_GOOGLE_STORAGE
        : process.env.NAME_BUCKET_GOOGLE_STORAGE_DOCS;

      if (!bucketName) {
        this.logger.error(`Error: Falta configuración del bucket (isBackup: ${isBackup})`);
        throw new Error('Configuración de bucket no encontrada');
      }

      // Mapeo de tipos MIME a extensiones de archivo
      const mimeToExt: Record<string, string> = {
        'application/pdf': '.pdf',
        'application/zip': '.zip',
        'application/gzip': '.gz',
        'application/x-gzip': '.gz',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
      };

      // Obtener la extensión basada en el contentType
      const extension = contentType ? (mimeToExt[contentType] || '.pdf') : '.pdf';
      const fileName = `${name}-${userId}-${upId}${extension}`;

      this.logger.log(`Intentando subir archivo ${fileName} al bucket ${bucketName}`);

      // Obtener instancia de Storage
      const storage = this.getStorageInstance();
      if (!storage) {
        throw new Error('No se pudo inicializar la instancia de Storage');
      }

      // Convertir a buffer de forma segura (evitando doble conversión)
      const buffer = file.buffer instanceof Buffer ? file.buffer : Buffer.from(file.buffer);

      // Subir el archivo con un Promise adecuado
      await storage
        .bucket(bucketName)
        .file(fileName)
        .save(buffer, {
          metadata: {
            contentType: contentType || 'application/octet-stream'
          },
          resumable: file.size > 5 * 1024 * 1024 // Usar resumable para archivos >5MB
        });

      this.logger.log(`Archivo subido exitosamente: ${fileName}`);

      const public_name = `https://storage.googleapis.com/${bucketName}/${fileName}`;

      return {
        success: true,
        public_name: fileName
      };
    } catch (error) {
      // Logging detallado del error
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error al subir archivo a GCS (${name}-${userId}): ${errorMessage}`, error);

      // Re-lanzar el error con información específica
      throw new Error(`Error al subir el archivo a Google Cloud Storage: ${errorMessage}`);
    }
  }

  /**
   * Obtiene un archivo de Google Cloud Storage.
   * @param fileName Nombre del archivo a obtener.
   * @returns El contenido del archivo como Buffer.
   */
  // async getFileGcs(fileName: string): Promise<Buffer> {}

  /**
   * Elimina un archivo de Google Cloud Storage.
   * @param param0 Datos necesarios para identificar el archivo a eliminar.
   * @returns Un objeto indicando el éxito y un mensaje.
   */
  async deleteFileGcs({ type, userId, upId }: PropsDelete): Promise<{ success: boolean; message: string }> {
    try {
      const storage = this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;
      const fileName = `${type}-${userId}-${upId}.pdf`;
      const file = storage.bucket(bucketName).file(fileName);

      await file.delete();

      return {
        success: true,
        message: `Archivo ${fileName} eliminado con éxito.`,
      };
    } catch (error) {
      this.logger.error('Error al eliminar el archivo:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
 * Verifica si un archivo existe en Google Cloud Storage.
 * @param fileName Nombre del archivo a verificar.
 * @returns Verdadero si el archivo existe, falso de lo contrario.
 */
  async fileExists(fileName: string): Promise<boolean> {
    try {
      const storage = this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;
      const [exists] = await storage.bucket(bucketName).file(fileName).exists();
      return exists;
    } catch (error) {
      this.logger.error('Error al verificar si el archivo existe:', error);
      return false;
    }
  }

  /**
   * Obtiene una URL firmada para acceder a un archivo por un tiempo limitado.
   * @param fileName Nombre del archivo.
   * @param expirationMinutes Tiempo de expiración en minutos (predeterminado: 60).
   * @returns URL firmada o null si hay un error.
   */
  async getSignedUrl(fileName: string, expirationMinutes = 60): Promise<string | null> {
    try {
      const storage = this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;

      const [url] = await storage
        .bucket(bucketName)
        .file(fileName)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + expirationMinutes * 60 * 1000,
        });

      return url;
    } catch (error) {
      this.logger.error('Error al obtener la URL firmada:', error);
      return null;
    }
  }

  /**
   * Downloads a ZIP archive from Google Cloud Storage.
   * @param documentId ID of the document (used for logging)
   * @param fileName Name of the ZIP file to download
   * @returns Buffer containing the ZIP file data
   */
  async downloadZipFromGcs(documentId: string, fileName: string): Promise<Buffer> {
    try {
      const storage = this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;

      // Download the ZIP file
      const [fileContents] = await storage
        .bucket(bucketName)
        .file(fileName)
        .download();

      this.logger.log(`ZIP file for document ${documentId} downloaded successfully`);
      return fileContents;
    } catch (error) {
      this.logger.error(`Error downloading ZIP file for document ${documentId}:`, error);
      throw error;
    }
  }
}
