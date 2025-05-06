// Definición de tipos para Cloudinary
declare module 'cloudinary' {
    export namespace v2 {
      namespace uploader {
        interface UploadApiOptions {
          folder?: string;
          resource_type?: string;
          public_id?: string;
          overwrite?: boolean;
          quality?: string;
          fetch_format?: string;
          timeout?: number;
          [key: string]: any;
        }
  
        interface UploadApiResponse {
          public_id: string;
          version: number;
          signature: string;
          width: number;
          height: number;
          format: string;
          resource_type: string;
          created_at: string;
          bytes: number;
          type: string;
          url: string;
          secure_url: string;
          [key: string]: any;
        }
  
        function upload(
          file: string,
          options?: UploadApiOptions,
          callback?: (error: any, result: UploadApiResponse) => void
        ): void;
      }
    }
  }