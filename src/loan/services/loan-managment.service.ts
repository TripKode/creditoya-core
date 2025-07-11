import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { UpdateLoanApplicationDto } from "../dto/update-loan.dto";
import { LoanApplication } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class LoanManagementService {
    private logger = new Logger(LoanManagementService.name);

    constructor(
        private readonly prisma: PrismaService,
    ) { }

    // Método para actualizar una solicitud de préstamo
    async update(id: string, data: UpdateLoanApplicationDto): Promise<LoanApplication> {
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

            // Extraer userId para posible uso en conexiones de relación
            const { userId, ...updateData } = data;

            // Preparar el objeto de actualización
            const updateObject: any = { ...updateData };

            // Si hay un userId, actualizar la relación con el usuario
            if (userId) {
                updateObject.user = {
                    connect: { id: userId }
                };
            }

            // Actualizar el préstamo
            const updatedLoan = await this.prisma.loanApplication.update({
                where: { id },
                data: updateObject,
                include: {
                    user: true,
                },
            });

            return updatedLoan;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException('Error al actualizar la solicitud de préstamo');
        }
    }

    // Método para eliminar una solicitud de préstamo
    async delete(id: string): Promise<LoanApplication> {
        try {
            // Verificar que la solicitud existe
            const existingLoan = await this.prisma.loanApplication.findUnique({
                where: { id }
            });

            if (!existingLoan) {
                throw new NotFoundException(`Solicitud de préstamo con ID ${id} no encontrada`);
            }

            const deletedLoan = await this.prisma.loanApplication.delete({
                where: { id }
            });

            return deletedLoan;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException('Error al eliminar la solicitud de préstamo');
        }
    }

    // Método para obtener una solicitud de préstamo por el ID del usuario
    async get(loanId: string, userId: string): Promise<LoanApplication> {
        try {
            const loan = await this.prisma.loanApplication.findUnique({
                where: { id: loanId, userId },
                include: {
                    user: { include: { Document: true } },
                    GeneratedDocuments: true,
                    EventLoanApplication: {
                        include: { LoanApplication: true }
                    }
                },
            });

            if (!loan) {
                throw new NotFoundException(`No se encontraron solicitudes de préstamo para el usuario con ID ${loanId}`);
            }

            return loan;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException('Error al obtener la solicitud de préstamo');
        }
    }

    // Método para obtener todas las solicitudes de préstamo por userId
    async getAllByUserId(userId: string): Promise<LoanApplication[]> {
        try {
            return this.prisma.loanApplication.findMany({
                where: { userId },
                include: {
                    user: true,
                },
            });
        } catch (error) {
            throw new BadRequestException('Error al obtener las solicitudes de préstamo');
        }
    }
}