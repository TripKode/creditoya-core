// src/modules/loan/services/loan.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { LoanApplication, StatusLoan } from '@prisma/client';
import { CreateLoanApplicationDto } from './dto/create-loan.dto';
import { UpdateLoanApplicationDto } from './dto/update-loan.dto';
import { ChangeLoanStatusDto } from './dto/change-loan-status.dto';

@Injectable()
export class LoanService {
  constructor(private prisma: PrismaService) { }

  // Método para crear una solicitud de préstamo
  async create(data: CreateLoanApplicationDto): Promise<LoanApplication> {
    const { userId, ...loanApplicationDataWithoutUserId } = data;

    try {
      const loanApplicationData = {
        ...loanApplicationDataWithoutUserId,
        user: {
          connect: {
            id: userId,
          },
        },
      };

      return this.prisma.loanApplication.create({
        data: loanApplicationData
      });
    } catch (error) {
      throw new BadRequestException('Error al crear la solicitud de préstamo');
    }
  }

  // Método para obtener una solicitud de préstamo por su ID
  async get(id: string): Promise<LoanApplication> {
    const loan = await this.prisma.loanApplication.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            Document: true,
          },
        },
      },
    });

    if (!loan) {
      throw new NotFoundException(`Solicitud de préstamo con ID ${id} no encontrada`);
    }

    return loan;
  }

  // Método para actualizar una solicitud de préstamo
  async update(id: string, data: UpdateLoanApplicationDto): Promise<LoanApplication> {
    try {
      // Verificar que la solicitud existe
      await this.get(id);

      return this.prisma.loanApplication.update({
        where: { id },
        data,
        include: {
          user: true,
        },
      });
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
      await this.get(id);

      return this.prisma.loanApplication.delete({
        where: { id }
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Error al eliminar la solicitud de préstamo');
    }
  }

  // Método para obtener todas las solicitudes de préstamo
  async getAll(
    page: number = 1,
    pageSize: number = 5,
    searchTerm: string = '',
    orderBy: 'asc' | 'desc' = 'asc',
    filterByAmount: boolean = false
  ): Promise<{ data: LoanApplication[]; total: number }> {
    const skip = (page - 1) * pageSize;

    // Build the where clause
    const where: any = {};

    // Apply search term if provided
    if (searchTerm && searchTerm.trim() !== '') {
      // For MongoDB, we need to handle relations differently
      // We'll query loan applications whose users match the search term
      const usersMatchingSearch = await this.prisma.user.findMany({
        where: {
          OR: [
            { names: { contains: searchTerm, mode: 'insensitive' } },
            { firstLastName: { contains: searchTerm, mode: 'insensitive' } },
            { secondLastName: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });

      // Find documents matching the search term
      const documentsMatchingSearch = await this.prisma.document.findMany({
        where: {
          number: { contains: searchTerm }
        },
        select: { userId: true }
      });

      // Combine all matching user IDs
      const matchingUserIds = [
        ...usersMatchingSearch.map(u => u.id),
        ...documentsMatchingSearch.map(d => d.userId)
      ];

      // If we found any matches, add them to the where clause
      if (matchingUserIds.length > 0) {
        where.userId = { in: matchingUserIds };
      } else if (searchTerm.trim() !== '') {
        // If search term provided but no matches found, return empty result
        // to avoid fetching all records when no match exists
        return { data: [], total: 0 };
      }
    }

    // Build the orderBy clause
    const orderByClause = filterByAmount
      ? { cantity: orderBy }
      : { created_at: orderBy };

    try {
      // First get the count without including relations to avoid errors
      const total = await this.prisma.loanApplication.count({ where });

      // Get all existing user IDs to ensure we only include valid relations
      const existingUserIds = await this.prisma.user.findMany({
        select: { id: true }
      });
      const validUserIds = existingUserIds.map(u => u.id);

      // Get loan applications without including user relation first
      const loansData = await this.prisma.loanApplication.findMany({
        where,
        orderBy: orderByClause,
        skip,
        take: pageSize,
      });

      // Manually fetch user data for loans with valid user IDs
      const loansWithUserData = await Promise.all(
        loansData.map(async (loan) => {
          if (validUserIds.includes(loan.userId)) {
            // User exists, fetch user data
            const userData = await this.prisma.user.findUnique({
              where: { id: loan.userId }
            });
            return { ...loan, user: userData };
          } else {
            // User doesn't exist, return loan without user data
            return { ...loan, user: null };
          }
        })
      );

      console.log(`Found ${total} loan applications matching criteria`);

      return {
        data: loansWithUserData,
        total
      };
    } catch (error) {
      console.error('Error fetching loan applications:', error);
      throw new BadRequestException('Error al obtener las solicitudes de préstamo');
    }
  }

  // Método para obtener las solicitudes de préstamo con estado "Pendiente"
  async getPendingLoans(
    page: number = 1,
    pageSize: number = 5
  ): Promise<{ data: LoanApplication[]; total: number }> {
    const skip = (page - 1) * pageSize;

    try {
      // Primero, obtenemos todos los ID de usuario válidos
      const validUserIds = await this.prisma.user.findMany({
        select: { id: true }
      });

      // Construir el objeto de filtros asegurando que solo incluya usuarios válidos
      const where: any = {
        status: StatusLoan.Pendiente,
        userId: {
          in: validUserIds.map(u => u.id)
        }
      };

      // Obtener las solicitudes de préstamo con paginación y filtro por estado
      const [data, total] = await this.prisma.$transaction([
        this.prisma.loanApplication.findMany({
          where,
          skip,
          take: pageSize,
          include: {
            user: {
              include: {
                Document: true, // Incluir el documento en la respuesta
              }
            } // Incluir la información del usuario

          },
        }),
        this.prisma.loanApplication.count({ where }),
      ]);

      return { data, total };
    } catch (error) {
      throw new BadRequestException('Error al obtener las solicitudes de préstamo pendientes');
    }
  }

  // Método para obtener las solicitudes de préstamo con estado "Aprobado"
  async getApprovedLoans(
    page: number = 1,
    pageSize: number = 5,
    documentNumber?: string
  ): Promise<{ data: LoanApplication[]; total: number }> {
    const skip = (page - 1) * pageSize;

    try {
      // Primero, obtenemos todos los ID de usuario válidos
      const validUserIds = await this.prisma.user.findMany({
        select: { id: true }
      });

      // Construir el objeto de filtros asegurando que solo incluya usuarios válidos
      const where: any = {
        status: StatusLoan.Aprobado,
        userId: {
          in: validUserIds.map(u => u.id)
        }
      };

      // Si se proporciona un número de documento, aplicar filtro adicional
      if (documentNumber) {
        // Encontrar usuarios con el número de documento específico
        const usersWithDocument = await this.prisma.user.findMany({
          where: {
            Document: {
              some: { number: documentNumber }
            }
          },
          select: { id: true }
        });

        // Usar solo los IDs de usuarios que tienen ese documento
        where.userId = {
          in: usersWithDocument.map(u => u.id)
        };
      }

      // Obtener las solicitudes de préstamo con paginación y filtro por estado y documento
      const [data, total] = await this.prisma.$transaction([
        this.prisma.loanApplication.findMany({
          where,
          skip,
          take: pageSize,
          include: {
            user: {
              include: {
                Document: true, // Incluir el documento en la respuesta
              },
            },
          },
        }),
        this.prisma.loanApplication.count({ where }),
      ]);

      return { data, total };
    } catch (error) {
      throw new BadRequestException('Error al obtener las solicitudes de préstamo aprobadas');
    }
  }

  // Método para obtener las solicitudes de préstamo con estado "Aplazado"
  async getDeferredLoans(
    page: number = 1,
    pageSize: number = 5,
    documentNumber?: string
  ): Promise<{ data: LoanApplication[]; total: number }> {
    const skip = (page - 1) * pageSize;

    try {
      // Primero, obtenemos todos los ID de usuario válidos
      const validUserIds = await this.prisma.user.findMany({
        select: { id: true }
      });

      // Construir el objeto de filtros asegurando que solo incluya usuarios válidos
      const where: any = {
        status: StatusLoan.Aplazado,
        userId: {
          in: validUserIds.map(u => u.id)
        }
      };

      // Si se proporciona un número de documento, aplicar filtro adicional
      if (documentNumber) {
        // Encontrar usuarios con el número de documento específico
        const usersWithDocument = await this.prisma.user.findMany({
          where: {
            Document: {
              some: { number: documentNumber }
            }
          },
          select: { id: true }
        });

        // Usar solo los IDs de usuarios que tienen ese documento
        where.userId = {
          in: usersWithDocument.map(u => u.id)
        };
      }

      // Obtener las solicitudes de préstamo con paginación y filtro por estado y documento
      const [data, total] = await this.prisma.$transaction([
        this.prisma.loanApplication.findMany({
          where,
          skip,
          take: pageSize,
          include: {
            user: {
              include: {
                Document: true, // Incluir el documento en la respuesta
              },
            },
          },
        }),
        this.prisma.loanApplication.count({ where }),
      ]);

      return { data, total };
    } catch (error) {
      throw new BadRequestException('Error al obtener las solicitudes de préstamo aplazadas');
    }
  }

  // Método para obtener las solicitudes de préstamo con newCantity definido y newCantityOpt nulo
  async getLoansWithDefinedNewCantity(
    page: number = 1,
    pageSize: number = 5,
    documentNumber?: string
  ): Promise<{ data: LoanApplication[]; total: number }> {
    const skip = (page - 1) * pageSize;

    // Construir el objeto de filtros
    const where: any = {
      newCantity: { not: null }, // newCantity debe estar definido
      newCantityOpt: null, // newCantityOpt debe ser nulo
    };

    // Si se proporciona un número de documento, agregar filtro para el documento del usuario
    if (documentNumber) {
      where.user = {
        Document: {
          some: { number: documentNumber }, // Filtrar por número de documento
        },
      };
    }

    try {
      // Obtener las solicitudes de préstamo con paginación y filtros especificados
      const [data, total] = await this.prisma.$transaction([
        this.prisma.loanApplication.findMany({
          where,
          skip,
          take: pageSize,
          include: {
            user: {
              include: {
                Document: true, // Incluir el documento en la respuesta
              },
            },
          },
        }),
        this.prisma.loanApplication.count({ where }),
      ]);

      return { data, total };
    } catch (error) {
      throw new BadRequestException('Error al obtener las solicitudes con nueva cantidad definida');
    }
  }

  // Método para obtener una solicitud de préstamo por el ID del usuario
  async getByUserId(userId: string): Promise<LoanApplication> {
    const loan = await this.prisma.loanApplication.findFirst({
      where: { userId },
      include: {
        user: true,
      },
    });

    if (!loan) {
      throw new NotFoundException(`No se encontraron solicitudes de préstamo para el usuario con ID ${userId}`);
    }

    return loan;
  }

  // Método para obtener todas las solicitudes de préstamo por userId
  async getAllByUserId(userId: string): Promise<LoanApplication[]> {
    return this.prisma.loanApplication.findMany({
      where: { userId },
      include: {
        user: true,
      },
    });
  }

  // Método para cambiar el Status de una solicitud
  async changeStatus(loanApplicationId: string, statusDto: ChangeLoanStatusDto): Promise<LoanApplication> {
    try {
      // Verificar que la solicitud existe
      await this.get(loanApplicationId);

      const { status, reasonReject, employeeId, reasonChangeCantity, newCantity } = statusDto;

      return this.prisma.loanApplication.update({
        where: { id: loanApplicationId },
        data: {
          status,
          reasonReject,
          employeeId,
          reasonChangeCantity,
          newCantity,
          newCantityOpt: newCantity ? true : undefined,
        },
        include: {
          user: true,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Error al cambiar el estado de la solicitud de préstamo');
    }
  }

  // Método para cambiar rejectReason de una solicitud
  async changeReject(loanApplicationId: string, reason: string): Promise<LoanApplication> {
    try {
      // Verificar que la solicitud existe
      await this.get(loanApplicationId);

      return this.prisma.loanApplication.update({
        where: { id: loanApplicationId },
        data: { reasonReject: reason },
        include: {
          user: true,
        },
      });
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
      await this.get(loanId);

      return this.prisma.loanApplication.update({
        where: { id: loanId },
        data: { employeeId },
        include: {
          user: true,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Error al asignar el empleado a la solicitud');
    }
  }

  // Método para cambiar cantidad y adjuntar razón del cambio
  async changeCantity(
    loanId: string,
    newCantity: string,
    reasonChangeCantity: string,
    employeeId: string
  ): Promise<LoanApplication> {
    try {
      // Verificar que la solicitud existe
      await this.get(loanId);

      return this.prisma.loanApplication.update({
        where: { id: loanId },
        data: {
          newCantity,
          reasonChangeCantity,
          employeeId,
          newCantityOpt: true,
        },
        include: {
          user: true,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Error al cambiar la cantidad del préstamo');
    }
  }

  // Método para aceptar o rechazar una nueva cantidad propuesta
  async respondToNewCantity(
    loanId: string,
    accept: boolean,
    status: StatusLoan
  ): Promise<LoanApplication> {
    try {
      // Verificar que la solicitud existe y tiene una nueva cantidad propuesta
      const loan = await this.get(loanId);

      if (!loan.newCantity) {
        throw new BadRequestException('Esta solicitud no tiene una nueva cantidad propuesta');
      }

      return this.prisma.loanApplication.update({
        where: { id: loanId },
        data: {
          newCantityOpt: accept,
          status: status,
        },
        include: {
          user: true,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error al responder a la nueva cantidad propuesta');
    }
  }
}