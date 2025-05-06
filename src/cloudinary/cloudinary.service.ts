import { Injectable, InternalServerErrorException, BadRequestException, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

export type FolderNames = 'reports-images' | 'avatars_users' | 'images_with_cc' | 'signatures';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor() {
    // Configuración de Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    // Verificar configuración de Cloudinary
    this.validateCloudinaryConfig();
  }

  /**
   * Valida la configuración de Cloudinary
   */
  private validateCloudinaryConfig() {
    const { cloud_name, api_key, api_secret } = cloudinary.config();

    if (!cloud_name || !api_key || !api_secret) {
      this.logger.error('Configuración de Cloudinary incompleta');
      // No lanzamos excepción para permitir que la aplicación inicie,
      // pero registramos el error para alertar
    } else {
      this.logger.log('Configuración de Cloudinary cargada correctamente');
    }
  }

  /**
   * Sube una imagen a Cloudinary y retorna la URL segura.
   * @param img La imagen en formato base64, URL remota u otro formato soportado.
   * @param folder La carpeta donde se guardará la imagen
   * @param publicId ID público opcional para la imagen
   * @returns La URL segura de la imagen subida.
   */
  async uploadImage(
    img: string,
    folder: FolderNames,
    publicId?: string
  ): Promise<string> {
    if (!img) {
      this.logger.error('Intento de subir imagen sin datos');
      throw new BadRequestException('La imagen es requerida');
    }

    // Validar el formato de la imagen base64
    if (img.startsWith('data:')) {
      this.validateBase64Image(img);
    }

    try {
      this.logger.log(`Iniciando subida a Cloudinary: folder=${folder}, publicId=${publicId || 'no definido'}`);

      // Configuración para la carga con opciones optimizadas
      const uploadOptions: cloudinary.uploader.UploadApiOptions = {
        folder,
        resource_type: 'auto', // Detecta automáticamente el tipo de recurso
        overwrite: true, // Sobrescribir si existe
        quality: 'auto:good', // Equilibrio entre calidad y tamaño
        fetch_format: 'auto', // Optimiza el formato
        timeout: 60000, // 60 segundos de timeout
      };

      // Agrega el public_id solo si se proporciona
      if (publicId) {
        uploadOptions.public_id = publicId;
      }

      // Realiza la carga a Cloudinary con manejadores específicos
      const result = await new Promise<cloudinary.uploader.UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader.upload(img, uploadOptions, (error, result) => {
          if (error) {
            reject(error);
          } else if (result) {
            resolve(result);
          } else {
            reject(new Error('Upload result is undefined'));
          }
        });
      });

      this.logger.log('Subida a Cloudinary exitosa', {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        size: result.bytes
      });

      return result.secure_url;
    } catch (error) {
      this.logger.error('Error al subir imagen a Cloudinary:', error);

      // Manejo específico de errores comunes
      if (error.http_code === 400) {
        throw new BadRequestException('Formato de imagen no válido o imagen corrupta.');
      }

      if (error.http_code === 401) {
        throw new InternalServerErrorException('Error de autenticación con Cloudinary. Verifique las credenciales.');
      }

      if (error.http_code === 413) {
        throw new BadRequestException('La imagen es demasiado grande para Cloudinary.');
      }

      if (error.message?.includes('timeout')) {
        throw new InternalServerErrorException('Tiempo de espera agotado al subir la imagen. La red puede estar lenta o la imagen es demasiado grande.');
      }

      // Error genérico
      throw new InternalServerErrorException(
        error instanceof Error ? `Error al subir imagen: ${error.message}` : 'Error desconocido al subir la imagen',
      );
    }
  }

  /**
   * Valida el formato de una imagen en base64
   */
  private validateBase64Image(base64Image: string): void {
    // Verificar que sea una cadena base64 válida
    const base64Regex = /^data:image\/(jpeg|jpg|png);base64,/;

    if (!base64Regex.test(base64Image)) {
      this.logger.error('Formato base64 inválido');
      throw new BadRequestException('Formato de imagen no válido. Se esperaba una cadena base64 de imagen JPEG, JPG o PNG.');
    }

    try {
      // Verificar que el contenido después del prefijo sea base64 válido
      const base64Data = base64Image.split(',')[1];
      const decodedData = Buffer.from(base64Data, 'base64');

      // Comprobar que tenga un tamaño mínimo razonable para una imagen
      if (decodedData.length < 100) {
        throw new Error('Datos de imagen demasiado pequeños o corruptos');
      }

      // Verificar los primeros bytes para formatos comunes de imagen
      // Esto es una validación básica y no exhaustiva
      const firstBytes = decodedData.slice(0, 4).toString('hex');

      // Verificar firmas de formato comunes (JPEG, PNG)
      const isJpeg = firstBytes.startsWith('ffd8');
      const isPng = firstBytes.startsWith('89504e47');

      if (!isJpeg && !isPng) {
        this.logger.warn('Los primeros bytes no corresponden a formatos JPEG o PNG comunes');
        // No lanzamos error aquí porque hay variantes y el formato puede ser válido
        // aunque no coincida con estas firmas específicas
      }
    } catch (error) {
      this.logger.error('Error validando imagen base64:', error);
      throw new BadRequestException('Los datos base64 proporcionados no son válidos o están corruptos.');
    }
  }

  /**
   * Elimina una imagen de Cloudinary por su public_id
   */
  async deleteImage(publicId: string): Promise<boolean> {
    try {
      this.logger.log(`Eliminando imagen de Cloudinary: ${publicId}`);

      const result = await cloudinary.uploader.destroy(publicId);

      this.logger.log(`Resultado de eliminación: ${result.result}`);

      return result.result === 'ok';
    } catch (error) {
      this.logger.error(`Error eliminando imagen ${publicId}:`, error);
      return false;
    }
  }
}