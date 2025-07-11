import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { LoanApplication, Prisma, StatusLoan } from "@prisma/client";
import { ChangeLoanStatusDto } from "../dto/change-loan-status.dto";
import { PrismaService } from "src/prisma/prisma.service";
import { MailService } from "src/mail/mail.service";
import { GoogleCloudService } from "src/gcp/gcp.service";

@Injectable()
export class StatusService {
    private logger = new Logger(StatusService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: MailService,
        private readonly gcp: GoogleCloudService
    ) { }

    // Método para cambiar el Status de una solicitud
    async changeStatus(loanApplicationId: string, statusDto: ChangeLoanStatusDto): Promise<LoanApplication> {
        try {
            // Verificar que la solicitud existe
            const existingLoan = await this.prisma.loanApplication.findUnique({
                where: { id: loanApplicationId },
                include: {
                    user: true,
                    GeneratedDocuments: true
                }
            });

            if (!existingLoan) {
                throw new NotFoundException(`Solicitud de préstamo con ID ${loanApplicationId} no encontrada`);
            }

            const { status, reasonReject, employeeId, reasonChangeCantity, newCantity } = statusDto;

            // Preparar el objeto para actualizar la solicitud
            const updateData: Prisma.LoanApplicationUpdateInput = {
                status,
                employeeId
            };

            // Agregar campos condicionales según lo que se haya proporcionado
            if (reasonReject) updateData.reasonReject = reasonReject;
            if (reasonChangeCantity) updateData.reasonChangeCantity = reasonChangeCantity;
            if (newCantity) updateData.newCantity = newCantity;

            // Usar una transacción para operaciones relacionadas
            return await this.prisma.$transaction(async (tx) => {
                // Actualizar la solicitud de préstamo
                const updatedLoan = await tx.loanApplication.update({
                    where: { id: loanApplicationId },
                    data: updateData,
                    include: {
                        user: true,
                        GeneratedDocuments: true
                    },
                });

                // Crear evento si hay cambio de cantidad
                if (newCantity && reasonChangeCantity) {
                    await tx.eventLoanApplication.create({
                        data: {
                            loanId: loanApplicationId,
                            type: "CHANGE_CANTITY",
                        }
                    });
                }

                // Procesar cambios según el estado actualizado
                if (status === 'Aprobado') {
                    // Obtener información del empleado que aprueba si existe ID
                    let employeeInfo: any = null;
                    if (employeeId) {
                        employeeInfo = await tx.usersIntranet.findUnique({
                            where: { id: employeeId },
                        });

                        if (!employeeInfo) {
                            this.logger.warn(`Empleado con ID ${employeeId} no encontrado para aprobación`);
                        }
                    }

                    // Si hay cambio de cantidad, enviar correo específico de cambio
                    if (newCantity && reasonChangeCantity && employeeInfo) {
                        await this.mail.sendChangeCantityMail({
                            employeeName: `${employeeInfo.name} ${employeeInfo.lastNames}`,
                            loanId: updatedLoan.id,
                            reason_aproved: reasonChangeCantity,
                            cantity_aproved: newCantity,
                            mail: updatedLoan.user.email,
                        });
                    } else {
                        // Correo de aprobación estándar
                        await this.mail.sendApprovalEmail({
                            loanId: updatedLoan.id,
                            mail: updatedLoan.user.email,
                        });
                    }
                } else if (status === 'Aplazado' && reasonReject) {
                    // Eliminar documentos generados solo si existen
                    if (updatedLoan.GeneratedDocuments && updatedLoan.GeneratedDocuments.length > 0) {
                        for (const doc of updatedLoan.GeneratedDocuments) {
                            if (doc.publicUrl) {
                                try {
                                    await this.gcp.deleteFileGcs({ fileUrl: doc.publicUrl });
                                } catch (deleteError) {
                                    this.logger.error(
                                        `Error al eliminar archivo ${doc.publicUrl} para préstamo ${loanApplicationId}`,
                                        deleteError
                                    );
                                    // Continúa con el proceso incluso si falla la eliminación de archivos
                                }
                            }
                        }

                        // Eliminar registros de documentos de la base de datos
                        await tx.generatedDocuments.deleteMany({
                            where: { loanId: updatedLoan.id }
                        });
                    }

                    // Correo de rechazo o aplazamiento
                    await this.mail.sendRejectionEmail({
                        loanId: updatedLoan.id,
                        reason: reasonReject,
                        mail: updatedLoan.user.email,
                    });
                }

                return updatedLoan;
            });
        } catch (error) {
            this.logger.error(
                `Error al cambiar el estado de solicitud ${loanApplicationId}:`,
                error
            );

            if (error instanceof NotFoundException) {
                throw error;
            }

            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                // Manejar errores específicos de Prisma
                throw new BadRequestException(
                    `Error de base de datos: ${error.message} (${error.code})`
                );
            }

            throw new BadRequestException(
                `Error al cambiar el estado de la solicitud de préstamo: ${error.message}`
            );
        }
    }

    // Método para cambiar rejectReason de una solicitud
    async changeReject(loanApplicationId: string, reason: string): Promise<LoanApplication> {
        try {
            // Verificar que la solicitud existe
            const existingLoan = await this.prisma.loanApplication.findUnique({
                where: { id: loanApplicationId },
                include: { user: true }
            });

            if (!existingLoan) {
                throw new NotFoundException(`Solicitud de préstamo con ID ${loanApplicationId} no encontrada`);
            }

            const updatedLoan = await this.prisma.loanApplication.update({
                where: { id: loanApplicationId },
                data: { reasonReject: reason },
                include: {
                    user: true,
                },
            });

            return updatedLoan;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException('Error al actualizar el motivo de rechazo');
        }
    }

    // Método para llenar el campo "employeeId" de una solicitud de préstamo específica
    async fillEmployeeId(loanId: string, employeeId: string): Promise<LoanApplication> {
        try {
            // Verificar que la solicitud existe
            const existingLoan = await this.prisma.loanApplication.findUnique({
                where: { id: loanId },
                include: { user: true }
            });

            if (!existingLoan) {
                throw new NotFoundException(`Solicitud de préstamo con ID ${loanId} no encontrada`);
            }

            const updatedLoan = await this.prisma.loanApplication.update({
                where: { id: loanId },
                data: { employeeId },
                include: {
                    user: true,
                },
            });

            return updatedLoan;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException('Error al asignar el empleado a la solicitud');
        }
    }

    // Método para aceptar o rechazar una nueva cantidad propuesta
    async respondToNewCantity(
        loanId: string,
        accept: boolean,
    ): Promise<LoanApplication> {
        try {
            // Verificar que la solicitud existe y tiene una nueva cantidad propuesta
            const loan = await this.prisma.loanApplication.findUnique({
                where: { id: loanId },
                include: { user: true }
            });

            if (!loan) {
                throw new NotFoundException(`Solicitud de préstamo con ID ${loanId} no encontrada`);
            }

            if (!loan.newCantity) {
                throw new BadRequestException('Esta solicitud no tiene una nueva cantidad propuesta');
            }

            const finalStatus: StatusLoan = accept ? "Aprobado" : "Aplazado"

            const updatedLoan = await this.prisma.loanApplication.update({
                where: { id: loanId },
                data: {
                    newCantityOpt: accept,
                    status: finalStatus,
                },
                include: {
                    user: true,
                },
            });

            const newEventInLoan = await this.prisma.eventLoanApplication.updateMany({
                where: { loanId, isAnswered: false, type: 'CHANGE_CANTITY' },
                data: { isAnswered: true }
            })

            if (!newEventInLoan) throw new Error("Error al crear evento en la solicitud");

            return updatedLoan;
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException('Error al responder a la nueva cantidad propuesta');
        }
    }
}