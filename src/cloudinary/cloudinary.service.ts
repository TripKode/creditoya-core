import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  /**
   * Sube una imagen a Cloudinary y retorna la URL segura.
   * @param img La imagen en formato base64, URL remota u otro formato soportado.
   * @returns La URL segura de la imagen subida.
   */
  async uploadImage(img: string): Promise<string> {
    try {
      if (!img) {
        throw new Error('La imagen es requerida');
      }

      // Genera un ID único para la imagen
      const randomUpId = Math.floor(100000 + Math.random() * 900000);

      // Realiza la carga a Cloudinary en el folder "reports-images"
      const result = await cloudinary.uploader.upload(img, {
        folder: 'reports-images',
        public_id: `${randomUpId}-report`,
      });

      return result.secure_url;
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Error desconocido al subir la imagen',
      );
    }
  }
}
