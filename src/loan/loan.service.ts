// src/modules/loan/services/loan.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';
import { LoanApplication, StatusLoan } from '@prisma/client';
import { CreateLoanApplicationDto } from './dto/create-loan.dto';
import { UpdateLoanApplicationDto } from './dto/update-loan.dto';
import { ChangeLoanStatusDto } from './dto/change-loan-status.dto';
import { MailService } from 'src/mail/mail.service';
import { PdfsService } from 'src/pdfs/pdfs.service';

@Injectable()
export class LoanService {
  private logger = new Logger(LoanService.name);
  private readonly CACHE_TTL = 3600; // 1 hour in seconds
  private readonly LOAN_CACHE_PREFIX = 'loan:';
  private readonly LOANS_LIST_CACHE_KEY = 'loans:list';
  private readonly USER_LOANS_CACHE_PREFIX = 'user:loans:';

  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
    private readonly mailService: MailService,
    private readonly pdfService: PdfsService,
  ) { }

  // Helper method to generate loan cache key
  private getLoanCacheKey(id: string): string {
    return `${this.LOAN_CACHE_PREFIX}${id}`;
  }

  // Helper method to generate user loans cache key
  private getUserLoansCacheKey(userId: string): string {
    return `${this.USER_LOANS_CACHE_PREFIX}${userId}`;
  }

  // Helper method to invalidate cache keys related to loan data
  private async invalidateLoanCache(loanId?: string): Promise<void> {
    // Clear list cache
    await this.redisService.del(this.LOANS_LIST_CACHE_KEY);

    // If specific loan ID provided, clear that loan's cache
    if (loanId) {
      await this.redisService.del(this.getLoanCacheKey(loanId));
    }

    // Clear potential related caches
    await this.redisService.delByPattern(`${this.LOAN_CACHE_PREFIX}*`);
    await this.redisService.delByPattern(`${this.USER_LOANS_CACHE_PREFIX}*`);
  }

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

      const newLoan = await this.prisma.loanApplication.create({
        data: loanApplicationData,
        include: { user: true },
      });

      // Invalidate cache after new loan creation
      await this.invalidateLoanCache();
      await this.redisService.del(this.getUserLoansCacheKey(userId));

      // Generate PDFs before sending email
      try {
        // Fetch user details if needed for the PDFs
        const user = await this.prisma.user.findUnique({
          where: {
            id: userId,
          }, include: { Document: true },
        });

        // Prepare document parameters
        const documentsParams = [
          // Promissory note document
          {
            name: `${user?.names} ${user?.firstLastName} ${user?.secondLastName}`,
            numberDocument: user?.Document[0]?.number ?? '',
            signature: newLoan.signature, // Assuming this is stored in the user model
            payQuantity: `$${newLoan.cantity.toLocaleString()}`,
            dayPay: new Date().toLocaleDateString(), // Current date as the signing date
            documentType: 'promissory-note',
            userId: userId, // Add userId to satisfy the interface
          },
          // Blank promissory note instructions
          {
            name: `${user?.names} ${user?.firstLastName} ${user?.secondLastName}`,
            numberDocument: user?.Document[0]?.number as string,
            signature: newLoan.signature,
            documentType: 'blank-instructions',
            userId: userId, // Add userId to satisfy the interface
          }
        ];

        // Generate and upload PDFs
        await this.pdfService.generateAndUploadPdfs(
          documentsParams,
          userId,
          newLoan.id
        );
      } catch (pdfError) {
        // Log the error but continue with the process
        this.logger.error('Error generating PDFs for loan application', pdfError);
        // Consider whether to fail the entire process or just continue
      }

      // Send email to user with PDF information
      await this.mailService.sendMailByUser({
        subject: 'Solicitud de préstamo creada',
        content: `Su solicitud de préstamo ha sido creada con éxito. ID: ${newLoan.id}. Los documentos necesarios han sido generados y están disponibles en su cuenta.`,
        addressee: newLoan.user.email,
      });

      return newLoan;
    } catch (error) {
      throw new BadRequestException('Error al crear la solicitud de préstamo');
    }
  }

  // Método para obtener una solicitud de préstamo por su ID
  async get(id: string): Promise<LoanApplication> {
    const cacheKey = this.getLoanCacheKey(id);

    return this.redisService.getOrSet<LoanApplication>(
      cacheKey,
      async () => {
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
      },
      this.CACHE_TTL
    );
  }

  // Método para actualizar una solicitud de préstamo
  async update(id: string, data: UpdateLoanApplicationDto): Promise<LoanApplication> {
    try {
      // Verificar que la solicitud existe
      const existingLoan = await this.get(id);

      const updatedLoan = await this.prisma.loanApplication.update({
        where: { id },
        data,
        include: {
          user: true,
        },
      });

      // Invalidate cache after update
      await this.invalidateLoanCache(id);
      await this.redisService.del(this.getUserLoansCacheKey(existingLoan.userId));

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
      const existingLoan = await this.get(id);

      const deletedLoan = await this.prisma.loanApplication.delete({
        where: { id }
      });

      // Invalidate cache after deletion
      await this.invalidateLoanCache(id);
      await this.redisService.del(this.getUserLoansCacheKey(existingLoan.userId));

      return deletedLoan;
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
    // Only cache if no search term is provided
    const shouldCache = !searchTerm;
    const cacheKey = shouldCache ?
      `${this.LOANS_LIST_CACHE_KEY}:p${page}:s${pageSize}:o${orderBy}:f${filterByAmount}` :
      null;

    const fetchLoans = async () => {
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
    };

    // If we should cache and have a cache key, use getOrSet
    if (shouldCache && cacheKey) {
      return this.redisService.getOrSet(cacheKey, fetchLoans, this.CACHE_TTL);
    }

    // Otherwise just fetch directly
    return fetchLoans();
  }

  // Método para obtener las solicitudes de préstamo con estado "Pendiente"
  async getPendingLoans(
    page: number = 1,
    pageSize: number = 5,
    documentNumber?: string
  ): Promise<{ data: LoanApplication[]; total: number }> {
    const cacheKey = documentNumber
      ? `loans:pending:p${page}:s${pageSize}:d${documentNumber}`
      : `loans:pending:p${page}:s${pageSize}`;

    // Limpiar el caché para asegurarnos de obtener datos frescos
    await this.redisService.del(cacheKey);

    return this.redisService.getOrSet(
      cacheKey,
      async () => {
        const skip = (page - 1) * pageSize;

        try {
          // Build the filter object
          const where: any = {
            status: StatusLoan.Pendiente, // Asegúrate de que esto es correcto
          };

          // If document number is provided, find users with that document first
          if (documentNumber) {
            const usersWithDocument = await this.prisma.user.findMany({
              where: {
                Document: {
                  some: {
                    number: { equals: documentNumber, mode: 'insensitive' }
                  }
                }
              },
              select: { id: true }
            });

            if (usersWithDocument.length > 0) {
              // Apply filter for those specific users
              where.userId = {
                in: usersWithDocument.map(u => u.id)
              };
            } else {
              // Si no hay usuarios con ese documento, devolvemos un conjunto vacío
              return { data: [], total: 0 };
            }
          }

          // Get loan applications that have valid user references first
          const validLoans = await this.prisma.loanApplication.findMany({
            where,
            include: {
              user: true
            },
            orderBy: {
              created_at: 'desc',
            },
          });

          // Para depuración - verifica que los préstamos tengan el estado correcto
          console.log('Loans after DB query:', validLoans.map(loan => ({ id: loan.id, status: loan.status })));

          // Filter out loans with null users first
          const loansWithValidUsers = validLoans.filter(loan => loan.user !== null);
          const total = loansWithValidUsers.length;

          // Apply pagination manually
          const paginatedData = loansWithValidUsers.slice(skip, skip + pageSize);

          // Get document information for each user if there are any loans
          if (paginatedData.length > 0) {
            const userIds = paginatedData.map(loan => loan.userId);

            const usersWithDocuments = await this.prisma.user.findMany({
              where: {
                id: { in: userIds }
              },
              include: {
                Document: true
              }
            });

            // Map users with their documents back to the loan data
            for (const loan of paginatedData) {
              const userWithDocs = usersWithDocuments.find(u => u.id === loan.userId);
              if (userWithDocs && userWithDocs.Document) {
                // Use type assertion to avoid TypeScript issues
                (loan.user as any).Document = userWithDocs.Document;
              }
            }
          }

          return { data: paginatedData, total };
        } catch (error) {
          console.error('Error fetching pending loans:', error);
          throw new BadRequestException('Error al obtener las solicitudes de préstamo pendientes');
        }
      },
      this.CACHE_TTL
    );
  }

  // Improved service method to handle all loan types with pagination
  async getLoans(
    status: StatusLoan | null = null,
    page: number = 1,
    pageSize: number = 10,
    searchQuery?: string,
    options: {
      withNewCantity?: boolean,
      withNewCantityOpt?: boolean | null
    } = {}
  ): Promise<{ data: LoanApplication[]; total: number }> {
    // Create a specific cache key based on all parameters
    const searchPart = searchQuery ? `:q${searchQuery}` : '';
    const cacheKey = `loans:${status || 'all'}:${options.withNewCantity ? 'newcantity' : ''}:p${page}:s${pageSize}${searchPart}`;

    return this.redisService.getOrSet(
      cacheKey,
      async () => {
        const skip = (page - 1) * pageSize;

        try {
          // Build the base where filter
          const where: any = {};

          // Add status filter if provided
          if (status) {
            where.status = status;
          }

          // Add newCantity filters if requested
          if (options.withNewCantity !== undefined) {
            where.newCantity = options.withNewCantity ? { not: null } : null;
          }

          // Add newCantityOpt filters if requested
          if (options.withNewCantityOpt !== undefined) {
            where.newCantityOpt = options.withNewCantityOpt;
          }

          // Handle search query - find users matching the search criteria
          let userIdsToInclude: string[] = [];
          if (searchQuery) {
            // First search for users with matching document number
            const usersWithMatchingDocument = await this.prisma.user.findMany({
              where: {
                Document: {
                  some: {
                    number: { contains: searchQuery, mode: 'insensitive' }
                  }
                }
              },
              select: { id: true }
            });

            // Then search for users with matching name components
            const usersWithMatchingName = await this.prisma.user.findMany({
              where: {
                OR: [
                  { names: { contains: searchQuery, mode: 'insensitive' } },
                  { firstLastName: { contains: searchQuery, mode: 'insensitive' } },
                  { secondLastName: { contains: searchQuery, mode: 'insensitive' } }
                ]
              },
              select: { id: true }
            });

            // Combine user IDs from both searches
            userIdsToInclude = [
              ...usersWithMatchingDocument.map(u => u.id),
              ...usersWithMatchingName.map(u => u.id)
            ];

            // Also include loans whose ID matches the search query
            const loanIdCondition = {
              id: { contains: searchQuery, mode: 'insensitive' }
            };

            if (userIdsToInclude.length > 0) {
              where.OR = [
                { userId: { in: userIdsToInclude } },
                loanIdCondition
              ];
            } else {
              where.OR = [loanIdCondition];
            }
          }

          // Count total loans matching criteria first (for accurate pagination)
          const totalLoans = await this.prisma.loanApplication.count({
            where
          });

          // Get loan applications with pagination applied directly in the query
          const loans = await this.prisma.loanApplication.findMany({
            where,
            include: {
              user: true
            },
            orderBy: {
              created_at: 'desc',
            },
            skip,
            take: pageSize
          });

          // Filter out loans with null users
          const loansWithValidUsers = loans.filter(loan => loan.user !== null);

          // Get document information for each user
          if (loansWithValidUsers.length > 0) {
            const userIds = loansWithValidUsers.map(loan => loan.userId);

            const usersWithDocuments = await this.prisma.user.findMany({
              where: {
                id: { in: userIds }
              },
              include: {
                Document: true
              }
            });

            // Map users with their documents back to the loan data
            for (const loan of loansWithValidUsers) {
              const userWithDocs = usersWithDocuments.find(u => u.id === loan.userId);
              if (userWithDocs && userWithDocs.Document) {
                (loan.user as any).Document = userWithDocs.Document;
              }
            }
          }

          return { data: loansWithValidUsers, total: totalLoans };
        } catch (error) {
          console.error('Error fetching loans:', error);
          throw new BadRequestException(`Error al obtener las solicitudes de préstamo: ${error.message}`);
        }
      },
      this.CACHE_TTL
    );
  }

  // Maintain backward compatibility with wrapper methods
  async getDeferredLoans(
    page: number = 1,
    pageSize: number = 10,
    searchQuery?: string
  ): Promise<{ data: LoanApplication[]; total: number }> {
    return this.getLoans(StatusLoan.Aplazado, page, pageSize, searchQuery);
  }

  async getApprovedLoans(
    page: number = 1,
    pageSize: number = 10,
    searchQuery?: string
  ): Promise<{ data: LoanApplication[]; total: number }> {
    return this.getLoans(StatusLoan.Aprobado, page, pageSize, searchQuery);
  }

  async getLoansWithDefinedNewCantity(
    page: number = 1,
    pageSize: number = 10,
    searchQuery?: string
  ): Promise<{ data: LoanApplication[]; total: number }> {
    return this.getLoans(null, page, pageSize, searchQuery, {
      withNewCantity: true,
      withNewCantityOpt: null
    });
  }

  // Método para obtener una solicitud de préstamo por el ID del usuario
  async getByUserId(userId: string): Promise<LoanApplication> {
    const cacheKey = `${this.USER_LOANS_CACHE_PREFIX}${userId}:single`;

    return this.redisService.getOrSet<LoanApplication>(
      cacheKey,
      async () => {
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
      },
      this.CACHE_TTL
    );
  }

  // Método para obtener todas las solicitudes de préstamo por userId
  async getAllByUserId(userId: string): Promise<LoanApplication[]> {
    const cacheKey = `${this.USER_LOANS_CACHE_PREFIX}${userId}:all`;

    return this.redisService.getOrSet<LoanApplication[]>(
      cacheKey,
      async () => {
        return this.prisma.loanApplication.findMany({
          where: { userId },
          include: {
            user: true,
          },
        });
      },
      this.CACHE_TTL
    );
  }

  // Método para cambiar el Status de una solicitud
  async changeStatus(loanApplicationId: string, statusDto: ChangeLoanStatusDto): Promise<LoanApplication> {
    try {
      // Verificar que la solicitud existe
      const existingLoan = await this.get(loanApplicationId);

      const { status, reasonReject, employeeId, reasonChangeCantity, newCantity } = statusDto;

      console.log(status, reasonReject, employeeId, reasonChangeCantity, newCantity);

      const updatedLoan = await this.prisma.loanApplication.update({
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

      // Invalidate cache after status change
      await this.invalidateLoanCache(loanApplicationId);
      await this.redisService.del(this.getUserLoansCacheKey(existingLoan.userId));

      const intraInfo = await this.prisma.usersIntranet.findFirst({
        where: { id: updatedLoan.employeeId! },
      })

      if (updatedLoan.newCantity && updatedLoan.reasonChangeCantity && intraInfo) {
        await this.mailService.sendChangeCantityMail({
          employeeName: `${intraInfo.name} ${intraInfo.lastNames}`,
          loanId: updatedLoan.id,
          reason_aproved: updatedLoan.reasonChangeCantity,
          cantity_aproved: updatedLoan.newCantity,
          mail: updatedLoan.user.email,
        });
      }

      return updatedLoan;
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
      const existingLoan = await this.get(loanApplicationId);

      const updatedLoan = await this.prisma.loanApplication.update({
        where: { id: loanApplicationId },
        data: { reasonReject: reason },
        include: {
          user: true,
        },
      });

      // Invalidate cache after update
      await this.invalidateLoanCache(loanApplicationId);
      await this.redisService.del(this.getUserLoansCacheKey(existingLoan.userId));

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
      const existingLoan = await this.get(loanId);

      const updatedLoan = await this.prisma.loanApplication.update({
        where: { id: loanId },
        data: { employeeId },
        include: {
          user: true,
        },
      });

      // Invalidate cache after update
      await this.invalidateLoanCache(loanId);
      await this.redisService.del(this.getUserLoansCacheKey(existingLoan.userId));

      return updatedLoan;
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
      const existingLoan = await this.get(loanId);

      const updatedLoan = await this.prisma.loanApplication.update({
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

      // Invalidate cache after update
      await this.invalidateLoanCache(loanId);
      await this.redisService.del(this.getUserLoansCacheKey(existingLoan.userId));

      await this.mailService.sendChangeCantityMail({
        employeeName: `${existingLoan.employeeId} ${existingLoan.employeeId}`,
        loanId: updatedLoan.id,
        reason_aproved: reasonChangeCantity,
        cantity_aproved: newCantity,
        mail: updatedLoan.user.email,
      });

      return updatedLoan;
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

      const updatedLoan = await this.prisma.loanApplication.update({
        where: { id: loanId },
        data: {
          newCantityOpt: accept,
          status: status,
        },
        include: {
          user: true,
        },
      });

      // Invalidate cache after update
      await this.invalidateLoanCache(loanId);
      await this.redisService.del(this.getUserLoansCacheKey(loan.userId));

      return updatedLoan;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error al responder a la nueva cantidad propuesta');
    }
  }
}