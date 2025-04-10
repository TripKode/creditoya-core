import { Inject, Injectable, Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import DecryptJson from 'handlers/decryptJson';
import { CREDENTIAL_GCP, GpcTypes } from 'templates/cloud';

export interface PropsUpload {
  file: File;
  userId: string;
  name: string;
  upId: string;
  contentType?: string
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
    const EnCredential = this.credential.k;
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
   * Sube un archivo a Google Cloud Storage.
   * @param param0 Datos necesarios para subir el archivo.
   * @returns Un objeto indicando el éxito y el nombre público del archivo.
   */
  async uploadToGcs({
    file,
    userId,
    name,
    upId,
    contentType,
  }: PropsUpload): Promise<{ success: boolean; public_name?: string }> {
    try {
      if (!file) {
        throw new Error('No se proporcionó un archivo');
      }
      if (file.size < 1) {
        throw new Error('El archivo está vacío');
      }

      // Convertir el archivo a buffer
      const buffer = await file.arrayBuffer();

      const storage = this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;

      // Determinar la extensión basada en el contentType
      let extension = '.pdf'; // Por defecto usa .pdf
      if (contentType === 'application/zip') {
        extension = '.zip';
      } else if (contentType) {
        // Si se proporciona un contentType diferente, extraer la extensión adecuada
        const mimeToExt: { [key: string]: string } = {
          'application/pdf': '.pdf',
          'application/zip': '.zip',
          'application/gzip': '.gz',
          'application/x-gzip': '.gz'
          // Añadir más tipos MIME según sea necesario
        };
        extension = mimeToExt[contentType] || '.pdf';
      }

      const fileName = `${name}-${userId}-${upId}${extension}`;

      // Subir el archivo al bucket con metadatos que incluyen el tipo de contenido
      await storage
        .bucket(bucketName)
        .file(fileName)
        .save(Buffer.from(buffer), {
          metadata: {
            contentType: contentType || file.type || 'application/octet-stream'
          }
        });

      return {
        success: true,
        public_name: fileName,
      };
    } catch (error) {
      this.logger.error('Error al subir el archivo a GCS:', error);
      throw error;
    }
  }

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
