import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LoggerService } from "src/logger/logger.service";
import { MailService } from "src/mail/mail.service";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class LoanDisbursementService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mail: MailService,
        private logger: LoggerService
    ) {
        this.logger.setContext('LoanDisbursementService')
    }

    async disburseLoan(id: string) {
        try {
            // Verificar que la solicitud existe
            const existingLoan = await this.prisma.loanApplication.findUnique({
                where: { id },
                include: {
                    user: true,
                },
            });

            if (!existingLoan) {
                throw new NotFoundException(`Solicitud de préstamo con ID ${id} no encontrada`);
            }

            // Verificar que el préstamo no haya sido desembolsado previamente
            if (existingLoan.isDisbursed) {
                throw new BadRequestException('Este préstamo ya ha sido desembolsado');
            }

            // Actualizar el préstamo
            const updatedLoan = await this.prisma.loanApplication.update({
                where: { id },
                data: {
                    isDisbursed: true,
                    dateDisbursed: new Date(),
                },
                include: {
                    user: true,
                },
            });

            // Enviar email de notificación de desembolso
            try {
                await this.mail.sendDisbursementEmail({
                    mail: updatedLoan.user.email,
                    amount: `$${updatedLoan.cantity.toLocaleString()}`,
                    bankAccount: `****${updatedLoan.bankNumberAccount?.slice(-4) || '****'}`, // Mostrar solo los últimos 4 dígitos
                    loanId: updatedLoan.id,
                    disbursementDate: updatedLoan.dateDisbursed
                        ? updatedLoan.dateDisbursed.toLocaleDateString('es-CO', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })
                        : '',
                });

                this.logger.log(`Disbursement email sent successfully for loan ${id}`);
            } catch (emailError) {
                // Log el error del email pero no fallar la operación de desembolso
                this.logger.error(`Failed to send disbursement email for loan ${id}: ${emailError.message}`);
            }

            return updatedLoan;
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException('Error al actualizar la solicitud de préstamo');
        }
    }
}