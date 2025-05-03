import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

export type FolderNames = 'reports-images' | 'avatars_users' | 'images_with_cc' | 'signatures';

@Injectable()
export class CloudinaryService {
  constructor() {
    // Configuración de Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
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
      throw new BadRequestException('La imagen es requerida');
    }

    try {
      // Configuración para la carga
      const uploadOptions = {
        folder,
        resource_type: 'auto', // Detecta automáticamente el tipo de recurso
      } as any; // Usamos "as any" para evitar problemas con los tipos

      // Agrega el public_id solo si se proporciona
      if (publicId) {
        uploadOptions.public_id = publicId;
      }

      // Realiza la carga a Cloudinary
      const result = await cloudinary.uploader.upload(img, uploadOptions);
      return result.secure_url;

    } catch (error) {
      console.error('Error al subir imagen a Cloudinary:', error);
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Error desconocido al subir la imagen',
      );
    }
  }
}