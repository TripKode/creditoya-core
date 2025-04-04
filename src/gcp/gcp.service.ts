import { Injectable, Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import credential from '../../jsons/cloud.json';
import DecryptJson from 'handlers/decryptJson';

export interface PropsUpload {
  file: File;
  userId: string;
  name: string;
  upId: string;
}

export interface PropsDelete {
  type: string;
  userId: string;
  upId: string;
}

@Injectable()
export class GoogleCloudService {
  private readonly logger = new Logger(GoogleCloudService.name);

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
   * Sube un archivo a Google Cloud Storage.
   * @param param0 Datos necesarios para subir el archivo.
   * @returns Un objeto indicando el éxito y el nombre público del archivo.
   */
  async uploadToGcs({ file, userId, name, upId }: PropsUpload): Promise<{ success: boolean; public_name?: string }> {
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
      const fileName = `${name}-${userId}-${upId}.pdf`;

      // Subir el archivo al bucket
      await storage
        .bucket(bucketName)
        .file(fileName)
        .save(Buffer.from(buffer));

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
}
