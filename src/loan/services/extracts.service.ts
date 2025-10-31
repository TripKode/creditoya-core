import { Injectable, Logger } from '@nestjs/common';
import { GoogleCloudService } from "src/gcp/gcp.service";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class ExtractsService {
    private logger = new Logger(ExtractsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly gcp: GoogleCloudService
    ) {}

    /**
     * Sube un extracto de préstamo al bucket temporal y actualiza el registro en la base de datos.
     * @param loanId ID del préstamo
     * @param file Archivo del extracto
     * @param cycode Código cycode opcional
     * @param extract URL del extracto opcional
     * @returns Resultado de la operación
     */
    async uploadExtract(loanId: string, file: Express.Multer.File, cycode?: string, extract?: string): Promise<{ success: boolean; message: string; publicUrl?: string }> {
        try {
            this.logger.log(`Iniciando subida de extracto para préstamo: ${loanId}`);

            // Generar un ID único para el archivo
            const upId = `extract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Subir el archivo al bucket temporal
            const uploadResult = await this.gcp.uploadToTempExtractsBucket({
                file,
                name: 'extract',
                upId,
                contentType: file.mimetype,
            });

            if (!uploadResult.success) {
                throw new Error('Error al subir el archivo al bucket');
            }

            // Actualizar el registro del préstamo en la base de datos
            await this.prisma.loanApplication.update({
                where: { id: loanId },
                data: {
                    cycode: cycode || null,
                    extract: uploadResult.public_name,
                },
            });

            this.logger.log(`Extracto subido exitosamente para préstamo: ${loanId}, URL: ${uploadResult.public_name}`);

            return {
                success: true,
                message: 'Extracto subido exitosamente',
                publicUrl: uploadResult.public_name,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
            this.logger.error(`Error al subir extracto para préstamo ${loanId}: ${errorMessage}`, error);
            return {
                success: false,
                message: `Error al subir el extracto: ${errorMessage}`,
            };
        }
    }

    /**
     * Actualiza solo el campo cycode de un préstamo.
     * @param loanId ID del préstamo
     * @param cycode Nuevo valor para cycode
     * @returns Resultado de la operación
     */
    async updateCycode(loanId: string, cycode: string): Promise<{ success: boolean; message: string }> {
        try {
            this.logger.log(`Actualizando cycode para préstamo: ${loanId}`);

            await this.prisma.loanApplication.update({
                where: { id: loanId },
                data: { cycode },
            });

            this.logger.log(`Cycode actualizado exitosamente para préstamo: ${loanId}`);

            return {
                success: true,
                message: 'Cycode actualizado exitosamente',
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
            this.logger.error(`Error al actualizar cycode para préstamo ${loanId}: ${errorMessage}`, error);
            return {
                success: false,
                message: `Error al actualizar cycode: ${errorMessage}`,
            };
        }
    }

    /**
     * Actualiza solo el campo extract de un préstamo subiendo un archivo PDF al bucket.
     * El archivo debe tener el formato "cycode-number_cedula.pdf" y el cycode debe coincidir con el del préstamo.
     * @param cycode Código cycode del préstamo
     * @param file Archivo PDF del extracto
     * @returns Resultado de la operación
     */
    async updateExtract(cycode: string, file: Express.Multer.File): Promise<{ success: boolean; message: string; publicUrl?: string }> {
        try {
            this.logger.log(`Actualizando extracto para préstamo con cycode: ${cycode}`);

            // Obtener el préstamo actual para verificar el cycode
            const loan = await this.prisma.loanApplication.findFirst({
                where: { cycode },
                select: { id: true, cycode: true, userId: true },
            });

            if (!loan) {
                throw new Error('Préstamo no encontrado');
            }

            if (!loan.cycode) {
                throw new Error('El préstamo no tiene un cycode definido');
            }

            // Extraer el cycode del nombre del archivo
            // El formato esperado es "cycode-number_cedula.pdf"
            const fileName = file.originalname;
            const fileNameWithoutExt = fileName.replace(/\.pdf$/i, '');
            const fileNameParts = fileNameWithoutExt.split('-');

            if (fileNameParts.length < 2) {
                throw new Error('El nombre del archivo debe tener el formato "cycode-number_cedula.pdf"');
            }

            const fileCycode = fileNameParts[0];

            // Verificar que el cycode del archivo coincida con el del préstamo
            if (fileCycode !== loan.cycode) {
                throw new Error(`El cycode del archivo (${fileCycode}) no coincide con el cycode del préstamo (${loan.cycode})`);
            }

            // Generar un ID único para el archivo
            const upId = `extract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Subir el archivo al bucket temporal como PDF
            const uploadResult = await this.gcp.uploadToTempExtractsBucket({
                file,
                name: 'extract',
                upId,
                contentType: 'application/pdf', // Forzar como PDF
            });

            if (!uploadResult.success) {
                throw new Error('Error al subir el archivo al bucket');
            }

            // Actualizar el registro del préstamo en la base de datos
            await this.prisma.loanApplication.update({
                where: { id: loan.id },
                data: { extract: uploadResult.public_name },
            });

            this.logger.log(`Extracto actualizado exitosamente para préstamo con cycode: ${cycode}, URL: ${uploadResult.public_name}`);

            return {
                success: true,
                message: 'Extracto actualizado exitosamente',
                publicUrl: uploadResult.public_name,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
            this.logger.error(`Error al actualizar extracto para préstamo con cycode ${cycode}: ${errorMessage}`, error);
            return {
                success: false,
                message: `Error al actualizar el extracto: ${errorMessage}`,
            };
        }
    }

    /**
     * Obtiene la información del extracto de un préstamo.
     * @param cycode Código cycode del préstamo
     * @returns Información del extracto
     */
    async getExtract(cycode: string): Promise<{ cycode?: string; extract?: string } | null> {
        try {
            const loan = await this.prisma.loanApplication.findFirst({
                where: { cycode },
                select: {
                    cycode: true,
                    extract: true,
                },
            });

            if (!loan) {
                return null;
            }

            return {
                cycode: loan.cycode || undefined,
                extract: loan.extract || undefined,
            };
        } catch (error) {
            this.logger.error(`Error al obtener extracto para préstamo con cycode ${cycode}:`, error);
            return null;
        }
    }
}