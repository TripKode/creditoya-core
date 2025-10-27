import { Body, Controller, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { CloudinaryService, FolderNames } from "./cloudinary.service";
import { FileInterceptor } from "@nestjs/platform-express"
import * as sharp from "sharp";
import { FileToString } from "handlers/FileToString";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiBadRequestResponse
} from '@nestjs/swagger';

@ApiTags('cloudinary')
@Controller('cloudinary')
export class CloudinaryController {
    constructor(
        private readonly cloudinaryService: CloudinaryService,
    ) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    @ApiOperation({ summary: 'Subir imagen a Cloudinary' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        description: 'Imagen a subir con configuración de carpeta',
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Archivo de imagen'
                },
                folder: {
                    type: 'string',
                    enum: ['avatars', 'documents', 'general'],
                    description: 'Carpeta de destino'
                },
                public_id: {
                    type: 'string',
                    description: 'ID público personalizado (opcional)'
                }
            }
        }
    })
    @ApiResponse({ status: 201, description: 'Imagen subida exitosamente' })
    @ApiBadRequestResponse({ description: 'Error al subir la imagen' })
    async uploadImage(
        @UploadedFile() file: Express.Multer.File,
        @Body('folder') folder: FolderNames,
        @Body('public_id') publicId: string,
    ) {
        const base64Image = await FileToString(file);
        return await this.cloudinaryService.uploadImage(base64Image, folder, publicId);
    }
}