import * as sharp from "sharp";

export async function FileToString(file: Express.Multer.File): Promise<string> {
    // Se Procesa la imagen con sharp manteniendo la calidad
    const processedImageBuffer = await sharp(file.buffer)
        .resize(800, null, {
            fit: 'inside',
            withoutEnlargement: true
        })
        .jpeg({ quality: 95 })
        .png({ quality: 100 })
        .toBuffer();

    // Convertir el buffer a base64 string
    const base64Image = `data:${file.mimetype};base64,${processedImageBuffer.toString('base64')}`;

    return base64Image;
}