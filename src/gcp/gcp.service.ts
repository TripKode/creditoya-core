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
  private logger = new Logger(GoogleCloudService.name);

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
        public_name,
      };
    } catch (error) {
      // Logging detallado del error
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error al subir archivo a GCS (${name}-${userId}): ${errorMessage}`, error);

      // Re-lanzar el error con información específica
      throw new Error(`Error al subir el archivo a Google Cloud Storage: ${errorMessage}`);
    }
  }

  async uploadDocsToLoan({
    userId,
    labor_card,
    upid_labor_card,
    fisrt_flyer,
    upid_first_flyer,
    second_flyer,
    upid_second_flyer,
    third_flyer,
    upid_third_flyer,
  }: {
    userId: string
    labor_card: Express.Multer.File | null,
    upid_labor_card: string | null,
    fisrt_flyer: Express.Multer.File | null,
    upid_first_flyer: string | null,
    second_flyer: Express.Multer.File | null,
    upid_second_flyer: string | null,
    third_flyer: Express.Multer.File | null,
    upid_third_flyer: string | null,
  }): Promise<{
    labor_card: string | null,
    fisrt_flyer: string | null,
    second_flyer: string | null,
    third_flyer: string | null,
  }> {
    this.logger.log('Iniciando carga de documentos de préstamo');
    const contentType = 'application/pdf';

    try {
      const nameBucket = process.env.NAME_BUCKET_GOOGLE_STORAGE_DOCS;

      // Objeto para almacenar los resultados de las subidas
      const results: Record<string, string | null> = {
        labor_card: null,
        fisrt_flyer: null,
        second_flyer: null,
        third_flyer: null,
      };

      // Procesar cada archivo si no es null y tiene ID correspondiente
      if (labor_card && upid_labor_card) {
        const laborCardResult = await this.uploadToGcs({
          file: labor_card,
          userId,
          name: 'labor_card',
          upId: upid_labor_card,
          contentType,
        });
        results.labor_card = laborCardResult.public_name;
      }

      if (fisrt_flyer && upid_first_flyer) {
        const firstFlyerResult = await this.uploadToGcs({
          file: fisrt_flyer,
          userId,
          name: 'paid_flyer_01',
          upId: upid_first_flyer,
          contentType,
        });
        results.fisrt_flyer = firstFlyerResult.public_name;
      }

      if (second_flyer && upid_second_flyer) {
        const secondFlyerResult = await this.uploadToGcs({
          file: second_flyer,
          userId,
          name: 'paid_flyer_02',
          upId: upid_second_flyer,
          contentType,
        });
        results.second_flyer = secondFlyerResult.public_name;
      }

      if (third_flyer && upid_third_flyer) {
        const thirdFlyerResult = await this.uploadToGcs({
          file: third_flyer,
          userId,
          name: 'paid_flyer_03',
          upId: upid_third_flyer,
          contentType,
        });
        results.third_flyer = thirdFlyerResult.public_name;
      }

      this.logger.log(`Documentos de préstamo cargados exitosamente para cliente: ${userId}`);

      return {
        labor_card: results.labor_card,
        fisrt_flyer: results.fisrt_flyer,
        second_flyer: results.second_flyer,
        third_flyer: results.third_flyer,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error al cargar documentos de préstamo: ${errorMsg}`, error);
      throw new Error(`Error al procesar documentos de préstamo: ${errorMsg}`);
    }
  }

  /**
   * Obtiene un archivo de Google Cloud Storage.
   * @param fileName Nombre del archivo a obtener.
   * @returns El contenido del archivo como Buffer.
   */
  // async getFileGcs(fileName: string): Promise<Buffer> {}

  /**
   * Elimina un archivo de Google Cloud Storage usando su URL completa o mediante parámetros individuales.
   * @param props Puede ser un objeto con la URL del archivo o los parámetros tradicionales (type, userId, upId)
   * @returns Un objeto indicando el éxito y un mensaje.
   */
  async deleteFileGcs(props: { fileUrl: string } | PropsDelete): Promise<{ success: boolean; message: string }> {
    try {
      const storage = this.getStorageInstance();
      let bucketName: string;
      let fileName: string;

      // Comprobar si estamos recibiendo una URL o los parámetros tradicionales
      if ('fileUrl' in props) {
        // Procesar URL completa: https://storage.googleapis.com/BUCKET_NAME/FILE_NAME
        const url = new URL(props.fileUrl);

        // La ruta comienza con '/' seguido del nombre del bucket y del archivo
        const pathParts = url.pathname.split('/').filter(part => part !== '');

        if (pathParts.length < 2) {
          throw new Error('URL de archivo inválida. Formato esperado: https://storage.googleapis.com/BUCKET_NAME/FILE_NAME');
        }

        bucketName = pathParts[0];
        // El nombre del archivo puede contener '/', así que unimos todas las partes restantes
        fileName = pathParts.slice(1).join('/');

        this.logger.log(`Eliminando archivo desde URL. Bucket: ${bucketName}, Archivo: ${fileName}`);
      } else {
        // Usar los parámetros tradicionales
        const { type, userId, upId, contentType } = props;
        bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;

        // Determinar la extensión correcta basada en contentType o usar PDF por defecto
        const extension = contentType
          ? this.getFileExtensionFromContentType(contentType)
          : '.pdf';

        fileName = `${type}-${userId}-${upId}${extension}`;

        this.logger.log(`Eliminando archivo con parámetros. Bucket: ${bucketName}, Archivo: ${fileName}`);
      }

      // Validar que tenemos toda la información necesaria
      if (!bucketName || !fileName) {
        throw new Error('No se pudo determinar el bucket o nombre del archivo');
      }

      // Eliminar el archivo
      await storage.bucket(bucketName).file(fileName).delete();

      return {
        success: true,
        message: `Archivo ${fileName} eliminado con éxito.`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error al eliminar el archivo: ${errorMessage}`, error);
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  /**
   * Obtiene la extensión de archivo basada en el tipo de contenido MIME.
   * @param contentType Tipo de contenido MIME
   * @returns La extensión de archivo correspondiente
   */
  private getFileExtensionFromContentType(contentType: string): string {
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

    return mimeToExt[contentType] || '.pdf';
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
   * @param filePath Path of the file within the bucket (not the full URL)
   * @returns Buffer containing the ZIP file data
   */
  async downloadZipFromGcs(documentId: string, filePath: string): Promise<Buffer> {
    try {
      const storage = this.getStorageInstance();
      const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;

      this.logger.log(`Downloading file: ${filePath} from bucket: ${bucketName} for document: ${documentId}`);

      // Check if file exists first
      const file = storage.bucket(bucketName).file(filePath);
      const [exists] = await file.exists();

      if (!exists) {
        throw new Error(`File ${filePath} does not exist in bucket ${bucketName}`);
      }

      // Download the ZIP file
      const [fileContents] = await file.download();

      this.logger.log(`ZIP file for document ${documentId} downloaded successfully. Size: ${fileContents.length} bytes`);
      return fileContents;
    } catch (error) {
      this.logger.error(`Error downloading ZIP file for document ${documentId} from path ${filePath}:`, error);
      throw error;
    }
  }
}
