import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { UploadId } from "../dto/change-loan-status.dto";
import { RandomUpIdsGenerator } from "handlers/GenerateUpIds";
import { LoanApplication } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { MailService } from "src/mail/mail.service";
import { GoogleCloudService } from "src/gcp/gcp.service";

@Injectable()
export class LoanDocumentService {
    private logger = new Logger(LoanDocumentService.name);

    constructor (
        private readonly prisma: PrismaService,
        private readonly mail: MailService,
        private readonly gcp: GoogleCloudService,
    ) { }

    async rejectDocumentInLoan(
        loanId: string,
        documentType: 'fisrt_flyer' | 'second_flyer' | 'third_flyer' | 'labor_card',
        reasonReject: string,
    ): Promise<LoanApplication> {
        try {

            // Determinar qué campos actualizar basado en el tipo de documento
            const updateData: any = {};

            if (documentType === 'fisrt_flyer') {
                updateData.fisrt_flyer = null;
                updateData.upid_first_flayer = null;
            } else if (documentType === 'second_flyer') {
                updateData.second_flyer = null;
                updateData.upid_second_flyer = null;
            } else if (documentType === 'third_flyer') {
                updateData.third_flyer = null;
                updateData.upid_third_flyer = null;
            } else if (documentType === 'labor_card') {
                updateData.labor_card = null;
                updateData.upid_labor_card = null;
            } else {
                throw new BadRequestException('Tipo de documento no válido');
            }

            // Actualizar la solicitud de préstamo
            const updatedLoan = await this.prisma.loanApplication.update({
                where: { id: loanId },
                data: updateData,
                include: {
                    user: true,
                },
            });

            // add event to loanApplication
            const newEventInLoan = await this.prisma.eventLoanApplication.create({
                data: {
                    loanId,
                    type: "DOCS_REJECT"
                }
            })

            if (!newEventInLoan) throw new Error("Error al crear evento en el prestamo")

            // Notificar al usuario sobre el rechazo del documento
            await this.mail.sendDeleteDocMail({
                loanId,
                mail: updatedLoan.user.email,
            });

            return updatedLoan;
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`Error al rechazar documento en préstamo ${loanId}:`, error);
            throw new BadRequestException(`Error al rechazar el documento: ${error.message}`);
        }
    }

    async uploadRejectedDocument(
        loanId: string,
        documentType: 'fisrt_flyer' | 'second_flyer' | 'third_flyer' | 'labor_card',
        file: Express.Multer.File
    ): Promise<LoanApplication> {
        try {
            // Verificar que la solicitud existe
            const existingLoan = await this.prisma.loanApplication.findUnique({
                where: { id: loanId },
                include: { user: true }
            });

            if (!existingLoan) {
                throw new NotFoundException(`Solicitud de préstamo con ID ${loanId} no encontrada`);
            }

            // Generar un UUID para el documento
            const uploadId = RandomUpIdsGenerator({
                isSignature: false,
                isLaborCard: documentType === 'labor_card',
                isFlyer: ['fisrt_flyer', 'second_flyer', 'third_flyer'].includes(documentType),
            });

            let uploadIdField: string | null = null;

            const typedUploadId: UploadId = uploadId;
            if (documentType === 'fisrt_flyer') {
                uploadIdField = uploadId.upid_first_flyer ?? null;
            } else if (documentType === 'second_flyer') {
                uploadIdField = uploadId.upid_second_flyer ?? null;
            } else if (documentType === 'third_flyer') {
                uploadIdField = uploadId.upid_third_flyer ?? null;
            } else if (documentType === 'labor_card') {
                uploadIdField = uploadId.upid_labor_card ?? null;
            }

            // Subir el documento a GCP
            const uploadedDocs = await this.gcp.uploadDocsToLoan({
                userId: existingLoan.userId,
                fisrt_flyer: documentType === 'fisrt_flyer' ? file : null,
                upid_first_flyer: documentType === 'fisrt_flyer' ? uploadIdField : null,
                second_flyer: documentType === 'second_flyer' ? file : null,
                upid_second_flyer: documentType === 'second_flyer' ? uploadIdField : null,
                third_flyer: documentType === 'third_flyer' ? file : null,
                upid_third_flyer: documentType === 'third_flyer' ? uploadIdField : null,
                labor_card: documentType === 'labor_card' ? file : null,
                upid_labor_card: documentType === 'labor_card' ? uploadIdField : null,
            });

            // Determinar qué campos actualizar basado en el tipo de documento
            const updateData: any = {};

            if (documentType === 'fisrt_flyer') {
                updateData.fisrt_flyer = uploadedDocs.fisrt_flyer;
                updateData.upid_first_flyer = uploadIdField;
            } else if (documentType === 'second_flyer') {
                updateData.second_flyer = uploadedDocs.second_flyer;
                updateData.upid_second_flyer = uploadIdField;
            } else if (documentType === 'third_flyer') {
                updateData.third_flyer = uploadedDocs.third_flyer;
                updateData.upid_third_flyer = uploadIdField;
            } else if (documentType === 'labor_card') {
                updateData.labor_card = uploadedDocs.labor_card;
                updateData.upid_labor_card = uploadIdField;
            }

            // Actualizar la solicitud de préstamo
            const updatedLoan = await this.prisma.loanApplication.update({
                where: { id: loanId },
                data: updateData,
                include: {
                    user: true,
                },
            });

            // Marcar los eventos relacionados como respondidos
            await this.prisma.eventLoanApplication.updateMany({
                where: {
                    loanId: loanId,
                    isAnswered: false,
                    type: 'DOCS_REJECT',
                },
                data: {
                    isAnswered: true
                }
            });

            // Registrar la actividad
            this.logger.log(`Documento rechazado actualizado para préstamo ${loanId}, tipo: ${documentType}`);

            return updatedLoan;
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`Error al actualizar documento rechazado en préstamo ${loanId}:`, error);
            throw new BadRequestException(`Error al actualizar el documento: ${error.message}`);
        }
    }
}