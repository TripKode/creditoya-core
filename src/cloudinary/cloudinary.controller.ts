import { Body, Controller, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { CloudinaryService, FolderNames } from "./cloudinary.service";
import { FileInterceptor } from "@nestjs/platform-express"
import * as sharp from "sharp";
import { FileToString } from "handlers/FileToString";

@Controller('cloudinary')
export class CloudinaryController {
    constructor(
        private readonly cloudinaryService: CloudinaryService,
    ) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadImage(
        @UploadedFile() file: Express.Multer.File,
        @Body('folder') folder: FolderNames,
        @Body('public_id') publicId: string,
    ) {
        const base64Image = await FileToString(file);
        return await this.cloudinaryService.uploadImage(base64Image, folder, publicId);
    }
}