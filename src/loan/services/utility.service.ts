import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { StatusLoan } from "@prisma/client";
import { GoogleCloudService } from "src/gcp/gcp.service";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class UtilityService {
    private logger = new Logger(UtilityService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly gcp: GoogleCloudService,
    ) { }

    /**
     * Función auxiliar para búsqueda avanzada de préstamos por nombre del usuario
     * Esta función procesa el texto de búsqueda y encuentra usuarios que coincidan
     * con los términos de búsqueda en sus campos de nombre
     */
    async searchLoansByUserName(
        searchText: string,
        status?: StatusLoan | null
    ): Promise<string[]> {
        // Normalizar el texto de búsqueda: convertir a minúsculas y eliminar acentos
        const normalizeText = (text: string): string => {
            return text
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
        };

        const normalizedSearchText = normalizeText(searchText);

        // Dividir el texto de búsqueda en términos individuales para buscar coincidencias parciales
        const searchTerms = normalizedSearchText
            .split(/\s+/)
            .filter(term => term.length >= 2); // Ignorar términos muy cortos

        if (searchTerms.length === 0) {
            return [];
        }

        try {
            // Buscar usuarios que coincidan con alguno de los términos de búsqueda
            const matchingUsers = await this.prisma.user.findMany({
                where: {
                    OR: [
                        // Buscar coincidencias en el campo names
                        {
                            names: {
                                contains: searchText,
                                mode: 'insensitive'
                            }
                        },
                        // Buscar coincidencias en el campo firstLastName
                        {
                            firstLastName: {
                                contains: searchText,
                                mode: 'insensitive'
                            }
                        },
                        // Buscar coincidencias en el campo secondLastName
                        {
                            secondLastName: {
                                contains: searchText,
                                mode: 'insensitive'
                            }
                        },
                        // Buscar coincidencias combinando los campos
                        {
                            OR: searchTerms.map(term => ({
                                OR: [
                                    { names: { contains: term, mode: 'insensitive' } },
                                    { firstLastName: { contains: term, mode: 'insensitive' } },
                                    { secondLastName: { contains: term, mode: 'insensitive' } }
                                ]
                            }))
                        }
                    ]
                },
                select: { id: true }
            });

            // También buscar por combinación de nombres y apellidos
            const fullNameSearch = await this.prisma.user.findMany({
                where: {
                    OR: [
                        // Buscar por combinación de nombres y primer apellido
                        {
                            AND: [
                                { names: { contains: searchTerms[0], mode: 'insensitive' } },
                                { firstLastName: { contains: searchTerms[1] || '', mode: 'insensitive' } }
                            ]
                        },
                        // Buscar por combinación de primer apellido y segundo apellido
                        {
                            AND: [
                                { firstLastName: { contains: searchTerms[0], mode: 'insensitive' } },
                                { secondLastName: { contains: searchTerms[1] || '', mode: 'insensitive' } }
                            ]
                        }
                    ]
                },
                select: { id: true }
            });

            // Combinar resultados y eliminar duplicados
            const combinedUserIds = [
                ...matchingUsers.map(u => u.id),
                ...fullNameSearch.map(u => u.id)
            ];

            // Eliminar duplicados usando Set
            const uniqueUserIds = [...new Set(combinedUserIds)];

            // Si hay un status definido, filtrar préstamos por status y user IDs
            if (status) {
                const loansWithStatus = await this.prisma.loanApplication.findMany({
                    where: {
                        userId: { in: uniqueUserIds },
                        status: status
                    },
                    select: { userId: true }
                });

                return [...new Set(loansWithStatus.map(loan => loan.userId))];
            }

            return uniqueUserIds;
        } catch (error) {
            this.logger.error('Error en la búsqueda por nombre:', error);
            return [];
        }
    }

    // Método adicional para descargar directamente un archivo ZIP
    async downloadZipDocument(documentId: string): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
        try {
            // Primero obtener la información del documento
            const document = await this.prisma.generatedDocuments.findUnique({
                where: { id: documentId }
            });

            if (!document) {
                throw new NotFoundException(`Documento con ID ${documentId} no encontrado`);
            }

            if (!document.publicUrl || !document.fileType.includes('zip')) {
                throw new BadRequestException('El documento solicitado no es un archivo ZIP válido');
            }

            // Obtener el nombre del archivo desde la URL
            const fileName = document.publicUrl.split('/').pop() || `documento-${documentId}.zip`;

            // Descargar el archivo ZIP desde GCS
            const fileBuffer = await this.gcp.downloadZipFromGcs(documentId, document.publicUrl);

            return {
                buffer: fileBuffer,
                fileName,
                contentType: document.fileType
            };
        } catch (error) {
            this.logger.error(`Error downloading ZIP document ${documentId}:`, error);
            throw new BadRequestException(`Error al descargar el archivo ZIP: ${error.message}`);
        }
    }
}