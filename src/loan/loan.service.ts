import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GeneratedDocuments, LoanApplication, Prisma, StatusLoan } from '@prisma/client';
import { CreateLoanApplicationDto, PreCreateLoanApplicationDto } from './dto/create-loan.dto';
import { UpdateLoanApplicationDto } from './dto/update-loan.dto';
import { ChangeLoanStatusDto } from './dto/change-loan-status.dto';
import { MailService } from 'src/mail/mail.service';
import { PdfsService } from 'src/pdfs/pdfs.service';
import { GoogleCloudService } from 'src/gcp/gcp.service';
import { RandomUpIdsGenerator } from 'handlers/GenerateUpIds';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { ILoanApplication, LoanStatus } from 'types/full';

@Injectable()
export class LoanService {
  private logger = new Logger(LoanService.name);
  // private readonly CACHE_TTL = 3600; // 1 hour in seconds
  // private readonly LOAN_CACHE_PREFIX = 'loan:';
  // private readonly PRE_CACHE_LOAN_KEY = 'pre-loan:';
  // private readonly LOANS_LIST_CACHE_KEY = 'loans:list';
  // private readonly USER_LOANS_CACHE_PREFIX = 'user:loans:';

  constructor(
    private prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly pdfService: PdfsService,
    private readonly gcpService: GoogleCloudService,
    private readonly cloudinary: CloudinaryService
  ) { }

  // Método para crear una solicitud de préstamo
  private async create(data: CreateLoanApplicationDto): Promise<ILoanApplication> {
    try {
      // Validación de documentos requeridos
      if (!data.isValorAgregado && !data.fisrt_flyer && !data.second_flyer && !data.third_flyer) {
        if (!data.labor_card) throw new BadRequestException("Porfavor sube los volantes de pago y la carta laboral");
        throw new BadRequestException("Porfavor sube los volantes de pago");
      }

      // Crear el préstamo en la base de datos
      const newLoan = await this.prisma.loanApplication.create({
        data: {
          // Conectar con el usuario usando el ID
          user: {
            connect: { id: data.userId },
          },
          // Datos principales del préstamo
          entity: data.entity,
          bankNumberAccount: data.bankNumberAccount,
          cantity: data.cantity,
          terms_and_conditions: data.terms_and_conditions,
          signature: data.signature,
          upSignatureId: data.upSignatureId,
          status: LoanStatus.PENDING, // Agregar estado por defecto

          // Documentos y sus IDs - corregir typos y usar null en lugar de undefined
          fisrt_flyer: data.fisrt_flyer ?? null,
          upid_first_flyer: data.upid_first_flayer ?? null,
          second_flyer: data.second_flyer ?? null,
          upid_second_flyer: data.uupid_second_flyer ?? null, // Corregido el typo
          third_flyer: data.third_flyer ?? null,
          upid_third_flyer: data.upid_third_flayer ?? null,
          labor_card: data.labor_card ?? null,
          upid_labor_card: data.upid_labor_card ?? null,
        },
        include: { user: true },
      });

      // Generar PDFs antes de enviar el correo
      try {
        // Obtener detalles del usuario para los PDFs
        const user = await this.prisma.user.findUnique({
          where: {
            id: data.userId,
          },
          include: { Document: true },
        });

        // Preparar parámetros de los documentos
        const documentsParams = [
          // Documento sobre el préstamo
          {
            documentType: 'about-loan',
            signature: newLoan.signature,
            numberDocument: user?.Document[0]?.number ?? '',
            entity: newLoan.entity,
            accountNumber: newLoan.bankNumberAccount,
            userId: data.userId,
          } as any,
          // Carta de instrucciones
          {
            documentType: 'instruction-letter',
            signature: newLoan.signature,
            numberDocument: user?.Document[0]?.number ?? '',
            name: `${user?.names} ${user?.firstLastName} ${user?.secondLastName}`,
            userId: data.userId,
          } as any,
          // Autorización de pago de salario
          {
            documentType: 'salary-payment-authorization',
            signature: newLoan.signature,
            numberDocument: user?.Document[0]?.number ?? '',
            name: `${user?.names} ${user?.firstLastName} ${user?.secondLastName}`,
            userId: data.userId,
          } as any,
          // Pagaré
          {
            documentType: 'promissory-note',
            signature: newLoan.signature,
            numberDocument: user?.Document[0]?.number ?? '',
            name: `${user?.names} ${user?.firstLastName} ${user?.secondLastName}`,
            userId: data.userId
          } as any,
        ];

        // Generar y subir PDFs
        await this.pdfService.generateAndUploadPdfs(
          documentsParams,
          data.userId,
          newLoan.id
        );
      } catch (pdfError) {
        // Registrar el error pero continuar con el proceso
        this.logger.error('Error generating PDFs for loan application', pdfError);
      }

      // Enviar correo al usuario con información del PDF
      await this.mailService.sendMailByUser({
        subject: 'Solicitud de préstamo creada',
        content: `Su solicitud de préstamo ha sido creada con éxito. ID: ${newLoan.id}. Los documentos necesarios han sido generados y están disponibles en su cuenta.`,
        addressee: newLoan.user.email,
      });

      return newLoan as unknown as ILoanApplication; // Conversión de tipo necesaria
    } catch (error) {
      throw new BadRequestException('Error al crear la solicitud de préstamo');
    }
  }

  async preCreate(data: Partial<PreCreateLoanApplicationDto>) {
    try {
      // Validation of required documents
      if (!data.isValorAgregado && !data.fisrt_flyer && !data.second_flyer && !data.third_flyer) {
        if (!data.labor_card) throw new BadRequestException("Porfavor sube los volantes de pago y la carta laboral");
        throw new BadRequestException("Porfavor sube los volantes de pago");
      }

      // Generate random IDs for documents
      const {
        upSignatureId,
        upid_first_flayer,
        uupid_second_flyer,
        upid_third_flayer,
        upid_labor_card
      } = RandomUpIdsGenerator({
        isSignature: true,
        isLaborCard: data.labor_card !== null,
        isFlyer: data.fisrt_flyer !== null
          && data.second_flyer !== null
          && data.third_flyer !== null,
      });

      const {
        fisrt_flyer,
        second_flyer,
        third_flyer,
        labor_card,
      } = await this.gcpService.uploadDocsToLoan({
        userId: data.userId as string,
        fisrt_flyer: data.fisrt_flyer ?? null,
        upid_first_flyer: upid_first_flayer ? upid_first_flayer : null,
        second_flyer: data.second_flyer ? data.second_flyer : null,
        upid_second_flyer: uupid_second_flyer ? uupid_second_flyer : null,
        third_flyer: data.third_flyer ? data.third_flyer : null,
        upid_third_flyer: upid_third_flayer ? upid_third_flayer : null,
        labor_card: data.labor_card ? data.labor_card : null,
        upid_labor_card: upid_labor_card ? upid_labor_card : null,
      });

      // Upload signature to Cloudinary
      const resImage = await this.cloudinary.uploadImage(
        data.signature as string,
        'signatures',
        `signature-${data.userId}-${upSignatureId}`
      );

      // Generate a 6-digit numeric token
      const token = Math.floor(100000 + Math.random() * 900000).toString();

      const preCreatedLoan = await this.prisma.preLoanApplication.create({
        data: {
          userId: data.userId as string,
          entity: data.entity as string,
          bankNumberAccount: data.bankNumberAccount as string,
          cantity: data.cantity as string,
          terms_and_conditions: data.terms_and_conditions as boolean,
          fisrt_flyer: fisrt_flyer ?? null,
          upid_first_flayer: upid_first_flayer ?? null,
          second_flyer: second_flyer ?? null,
          upid_second_flayer: uupid_second_flyer ?? null,
          third_flyer: third_flyer ?? null,
          upid_third_flayer: upid_third_flayer ?? null,
          labor_card: labor_card ?? null,
          upid_labor_card: upid_labor_card ?? null,
          signature: resImage,
          upSignatureId: upSignatureId as string,
          token,
        },
        include: { user: true },
      });

      // send email to user with the token
      await this.mailService.sendMailByUser({
        subject: 'Solicitud de préstamo pre-creada',
        content: `Su solicitud de préstamo ha sido pre-creada con éxito. ID: ${preCreatedLoan.id}. El token para verificar su solicitud es: ${token}`,
        addressee: preCreatedLoan.user.email,
      });

      // Prepare the result
      const result = {
        success: true,
        loanId: preCreatedLoan.id,
        createdAt: preCreatedLoan.created_at
      };

      this.logger.log(`Pre-created loan application for user ${data.userId}`);
      return result;
    } catch (error) {
      this.logger.error('Error pre-creating loan application:', error);
      throw new BadRequestException('Error al pre-crear la solicitud de préstamo');
    }
  }

  async verifyPreLoan(token: string, preId: string): Promise<CreateLoanApplicationDto> {
    try {
      const preLoan = await this.prisma.preLoanApplication.findUnique({
        where: { id: preId },
        include: { user: true },
      });

      if (!preLoan) {
        throw new NotFoundException('Solicitud de préstamo no encontrada');
      }

      // Check if the token is valid
      if (preLoan.token !== token) {
        throw new BadRequestException('Token inválido o ha expirado');
      }

      const bodyReqLoan: CreateLoanApplicationDto = {
        userId: preLoan.userId,
        entity: preLoan.entity,
        bankNumberAccount: preLoan.bankNumberAccount,
        cantity: preLoan.cantity,
        terms_and_conditions: preLoan.terms_and_conditions,
        fisrt_flyer: preLoan.fisrt_flyer,
        upid_first_flayer: preLoan.upid_first_flayer,
        second_flyer: preLoan.second_flyer,
        uupid_second_flyer: preLoan.upid_second_flayer,
        third_flyer: preLoan.third_flyer,
        upid_third_flayer: preLoan.upid_third_flayer,
        labor_card: preLoan.labor_card,
        upid_labor_card: preLoan.upid_labor_card,
        signature: preLoan.signature,
        upSignatureId: preLoan.upSignatureId,
      }

      const newLoan = await this.create(bodyReqLoan);

      if (!newLoan) {
        throw new BadRequestException('Error al crear la solicitud de préstamo');
      }

      // Enviar correo al usuario con información del préstamo
      await this.mailService.sendMailByUser({
        subject: 'Solicitud de préstamo creada',
        content: `Su solicitud de préstamo ha sido creada con éxito. ID: ${newLoan.id}. Los documentos necesarios han sido generados y están disponibles en su cuenta.`,
        addressee: newLoan.user?.email as string,
      })

      // Verificar registro con TripChain (BETA)

      // Hash
      // await this.prisma.preLoanApplication.update({
      //   where: { id: preId },
      //   data: { hash },
      // });

      // Return the data that was used to create the loan
      return bodyReqLoan;
    } catch (error) {
      this.logger.error('Error verifying pre-loan:', error);
      throw new BadRequestException('Error al verificar la solicitud de préstamo');
    }
  }

  // // Método para obtener una solicitud de préstamo por su ID
  // async get(id: string, options: { generateSignedUrls?: boolean } = {}): Promise<LoanApplication & { documents?: any[] }> {
  //   // Obtener el préstamo directamente sin caché
  //   const loan = await this.prisma.loanApplication.findUnique({
  //     where: { id },
  //     include: {
  //       user: {
  //         include: {
  //           Document: true,
  //         },
  //       },
  //       GeneratedDocuments: true
  //     },
  //   });

  //   if (!loan) {
  //     throw new NotFoundException(`Solicitud de préstamo con ID ${id} no encontrada`);
  //   }

  //   // Procesar los documentos generados
  //   if (loan.GeneratedDocuments && loan.GeneratedDocuments.length > 0) {
  //     // Vamos a manejar los documentos para añadir URLs firmadas o descargas directas
  //     const enhancedDocuments = await Promise.all(
  //       loan.GeneratedDocuments.map(async (doc) => {
  //         // Solo procesar si es un documento ZIP
  //         if (doc.fileType === 'application/zip' || doc.fileType.includes('zip')) {
  //           try {
  //             // Opción 1: Generar URL firmada con tiempo limitado (5 minutos)
  //             if (options.generateSignedUrls !== false) {
  //               const signedUrl = await this.gcpService.getSignedUrl(
  //                 doc.publicUrl || `${doc.uploadId}.zip`,
  //                 5 // 5 minutos de tiempo de expiración
  //               );

  //               return {
  //                 ...doc,
  //                 signedUrl,
  //                 fileInfo: await this.getZipFileInfo(doc)
  //               };
  //             }
  //             // La URL pública ya está incluida en el documento
  //           } catch (error) {
  //             this.logger.error(`Error processing ZIP document ${doc.id}:`, error);
  //             // Devolvemos el documento sin cambios si hay un error
  //           }
  //         }
  //         return doc;
  //       })
  //     );

  //     // Añadir los documentos procesados al resultado
  //     const result = {
  //       ...loan,
  //       GeneratedDocuments: enhancedDocuments
  //     };

  //     return result;
  //   }

  //   return loan;
  // }

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

  /**
     * Enhanced method to get all loans for a specific user with pagination and filtering options
     * @param userId - The ID of the user whose loans we want to retrieve
     * @param page - Page number for pagination (default: 1)
     * @param pageSize - Number of items per page (default: 10)
     * @param status - Optional filter by loan status
     * @returns Paginated loans and total count
     */
  async getAllLoansByUserId(
    userId: string,
    page: number = 1,
    pageSize: number = 10,
    status?: StatusLoan
  ): Promise<{ data: LoanApplication[]; total: number }> {
    try {
      const skip = (page - 1) * pageSize;

      // Build where clause
      const where: Prisma.LoanApplicationWhereInput = { userId };

      // Add status filter if provided
      if (status) {
        where.status = status;
      }

      // Count total matching loans for pagination
      const total = await this.prisma.loanApplication.count({ where });

      // Get loan applications with pagination
      const loans = await this.prisma.loanApplication.findMany({
        where,
        include: {
          user: true,
          GeneratedDocuments: true
        },
        orderBy: {
          created_at: 'desc' // Most recent first
        },
        skip,
        take: pageSize
      });

      this.logger.log(`Found ${total} loan applications for user ${userId}`);

      // Process loans to include document info if needed
      const processedLoans = await Promise.all(
        loans.map(async (loan) => {
          // If there are generated documents and we want to process them further
          if (loan.GeneratedDocuments && loan.GeneratedDocuments.length > 0) {
            loan.GeneratedDocuments = loan.GeneratedDocuments.map(doc => ({
              ...doc,
              // Add any additional processing here if needed
            }));
          }
          return loan;
        })
      );

      return { data: processedLoans, total };
    } catch (error) {
      this.logger.error(`Error fetching loans for user ${userId}:`, error);
      throw new BadRequestException(`Error al obtener los préstamos del usuario: ${error.message}`);
    }
  }

  // Método para obtener las solicitudes de préstamo con estado "Pendiente"
  async getPendingLoans(
    page: number = 1,
    pageSize: number = 5,
    documentNumber?: string
  ): Promise<{ data: LoanApplication[]; total: number }> {
    const skip = (page - 1) * pageSize;

    try {
      // Construir un filtro where exacto para status=Pendiente
      const where: Prisma.LoanApplicationWhereInput = {
        status: StatusLoan.Pendiente // Esto fuerza una coincidencia exacta
      };

      // Aplicar búsqueda por número de documento si se proporciona
      if (documentNumber && documentNumber.trim() !== '') {
        const cleanDocNumber = documentNumber.trim();

        // Buscar usuarios con ese número de documento
        const usersWithDocument = await this.prisma.user.findMany({
          where: {
            Document: {
              some: {
                number: { contains: cleanDocNumber }
              }
            }
          },
          select: { id: true }
        });

        const userIds = usersWithDocument.map(u => u.id);

        // Si encontramos coincidencias, filtrar por esos usuarios
        if (userIds.length > 0) {
          where.userId = { in: userIds };
        } else {
          // Si no hay coincidencias con el número de documento, devolver resultado vacío
          return { data: [], total: 0 };
        }
      }

      // Contar el total de préstamos pendientes que coinciden con los criterios
      const totalLoans = await this.prisma.loanApplication.count({
        where
      });

      // Obtener los préstamos pendientes con paginación
      const loans = await this.prisma.loanApplication.findMany({
        where,
        include: {
          user: true
        },
        orderBy: {
          created_at: 'asc', // Del más viejo al más reciente
        },
        skip,
        take: pageSize
      });

      // Filtrar préstamos con usuarios nulos
      const loansWithValidUsers = loans.filter(loan => loan.user !== null);

      // Obtener información de documentos para cada usuario eficientemente
      if (loansWithValidUsers.length > 0) {
        const userIds = loansWithValidUsers.map(loan => loan.userId);

        // Consulta para obtener todos los usuarios con sus documentos
        const usersWithDocuments = await this.prisma.user.findMany({
          where: {
            id: { in: userIds }
          },
          include: {
            Document: true
          }
        });

        // Crear un mapa para búsqueda rápida
        const userDocMap = new Map(
          usersWithDocuments.map(user => [user.id, user])
        );

        // Adjuntar datos de documentos a cada préstamo
        for (const loan of loansWithValidUsers) {
          const userWithDocs = userDocMap.get(loan.userId);
          if (userWithDocs) {
            (loan.user as any).Document = userWithDocs?.Document || [];
          }
        }
      }

      this.logger.log(`Se encontraron ${totalLoans} préstamos pendientes`);
      return { data: loansWithValidUsers, total: totalLoans };
    } catch (error) {
      this.logger.error('Error al obtener préstamos pendientes:', error);
      throw new BadRequestException(`Error al obtener las solicitudes de préstamo pendientes: ${error.message}`);
    }
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
    const skip = (page - 1) * pageSize;

    try {
      // Base where filter para préstamos con newCantity no nulo y reasonChangeCantity definido
      const where: Prisma.LoanApplicationWhereInput = {
        newCantity: {
          not: null,
        },
        reasonChangeCantity: {
          not: null,
        }
      };

      // ---- BÚSQUEDA MEJORADA ----
      if (searchQuery && searchQuery.trim() !== '') {
        const cleanSearchQuery = searchQuery.trim();

        // Evaluar si la búsqueda es un número de documento
        const isDocNumberSearch = /^\d+$/.test(cleanSearchQuery);

        let userIdsToInclude: string[] = [];

        // Si parece un número de documento, buscar primero por documento
        if (isDocNumberSearch) {
          const usersWithMatchingDocument = await this.prisma.user.findMany({
            where: {
              Document: {
                some: {
                  number: { contains: cleanSearchQuery }
                }
              }
            },
            select: { id: true }
          });

          userIdsToInclude = usersWithMatchingDocument.map(u => u.id);
        }

        // Si no encontramos usuarios por número de documento o no es un número,
        // realizamos búsqueda por nombre
        if (userIdsToInclude.length === 0 && cleanSearchQuery.length >= 2) {
          // Usar nuestra nueva función especializada de búsqueda por nombre
          userIdsToInclude = await this.searchLoansByUserName(cleanSearchQuery, null);
        }

        // Preparar las condiciones de búsqueda
        const searchConditions: Prisma.LoanApplicationWhereInput[] = [];

        // Incluir búsqueda por ID de préstamo
        const isPossibleId = cleanSearchQuery.includes('-') || /^[a-f0-9-]+$/i.test(cleanSearchQuery);

        if (isPossibleId) {
          searchConditions.push({
            id: { contains: cleanSearchQuery, mode: 'insensitive' as Prisma.QueryMode }
          });
        }

        // Incluir búsqueda por IDs de usuario si encontramos alguna coincidencia
        if (userIdsToInclude.length > 0) {
          searchConditions.push({
            userId: { in: userIdsToInclude }
          });
        }

        // Si no tenemos condiciones de búsqueda, devolver un resultado vacío
        if (searchConditions.length === 0) {
          this.logger.log(`No se encontraron coincidencias para la búsqueda: ${cleanSearchQuery}`);
          return { data: [], total: 0 };
        }

        // Combinar todas las condiciones de búsqueda con OR, manteniendo el filtro principal de newCantity
        where.AND = [
          { newCantity: { not: null } },
          { reasonChangeCantity: { not: null } },
          { OR: searchConditions }
        ];
      }
      // ---- FIN DE BÚSQUEDA MEJORADA ----

      // Count total loans matching criteria for pagination
      const totalLoans = await this.prisma.loanApplication.count({
        where
      });

      // Get loan applications with pagination applied
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

      this.logger.log(`Se encontraron ${totalLoans} préstamos con nueva cantidad definida`);
      return { data: loansWithValidUsers, total: totalLoans };
    } catch (error) {
      this.logger.error('Error al obtener préstamos con nueva cantidad:', error);
      throw new BadRequestException(`Error al obtener las solicitudes de préstamo con nueva cantidad: ${error.message}`);
    }
  }

  async rejectDocumentInLoan(
    loanId: string,
    documentType: 'fisrt_flyer' | 'second_flyer' | 'third_flyer' | 'labor_card'
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

      // Notificar al usuario sobre el rechazo del documento
      await this.mailService.sendDeleteDocMail({
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
    fileData: {
      fileUrl: string,
      uploadId: string
    }
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

      // Verificar que el usuario que solicita la actualización es el propietario del préstamo
      // Esta validación debería hacerse en el controlador o middleware, pero se incluye aquí como referencia

      // Determinar qué campos actualizar basado en el tipo de documento
      const updateData: any = {};

      if (documentType === 'fisrt_flyer') {
        updateData.fisrt_flyer = fileData.fileUrl;
        updateData.upid_first_flayer = fileData.uploadId;
      } else if (documentType === 'second_flyer') {
        updateData.second_flyer = fileData.fileUrl;
        updateData.upid_second_flyer = fileData.uploadId;
      } else if (documentType === 'third_flyer') {
        updateData.third_flyer = fileData.fileUrl;
        updateData.upid_third_flayer = fileData.uploadId;
      } else if (documentType === 'labor_card') {
        updateData.labor_card = fileData.fileUrl;
        updateData.upid_labor_card = fileData.uploadId;
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

      return updatedLoan;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error al actualizar documento rechazado en préstamo ${loanId}:`, error);
      throw new BadRequestException(`Error al actualizar el documento: ${error.message}`);
    }
  }

  // Método para obtener una solicitud de préstamo por el ID del usuario
  async get(loanId: string, userId: string): Promise<LoanApplication> {
    try {
      const loan = await this.prisma.loanApplication.findUnique({
        where: { id: loanId, userId },
        include: {
          user: true,
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

  // Método para cambiar el Status de una solicitud
  async changeStatus(loanApplicationId: string, statusDto: ChangeLoanStatusDto): Promise<LoanApplication> {
    try {
      // Verificar que la solicitud existe
      const existingLoan = await this.prisma.loanApplication.findUnique({
        where: { id: loanApplicationId },
        include: { user: true }
      });

      if (!existingLoan) {
        throw new NotFoundException(`Solicitud de préstamo con ID ${loanApplicationId} no encontrada`);
      }

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

      // Procesar la notificación por correo electrónico si es necesario
      if (updatedLoan.newCantity && updatedLoan.reasonChangeCantity && employeeId) {
        const intraInfo = await this.prisma.usersIntranet.findFirst({
          where: { id: employeeId },
        });

        if (intraInfo) {
          await this.mailService.sendChangeCantityMail({
            employeeName: `${intraInfo.name} ${intraInfo.lastNames}`,
            loanId: updatedLoan.id,
            reason_aproved: updatedLoan.reasonChangeCantity,
            cantity_aproved: updatedLoan.newCantity,
            mail: updatedLoan.user.email,
          });
        }
      }

      return updatedLoan;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error detallado:', error);
      throw new BadRequestException('Error al cambiar el estado de la solicitud de préstamo');
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

  // Método para cambiar cantidad y adjuntar razón del cambio
  async changeCantity(
    loanId: string,
    newCantity: string,
    reasonChangeCantity: string,
    employeeId: string
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

      return updatedLoan;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Error al responder a la nueva cantidad propuesta');
    }
  }

  // aux methods

  // Método mejorado para obtener préstamos con filtros y búsqueda avanzada
  private async getLoans(
    status: StatusLoan | null = null,
    page: number = 1,
    pageSize: number = 10,
    searchQuery?: string,
    options: {
      withNewCantity?: boolean,
      withNewCantityOpt?: boolean | null
    } = {}
  ): Promise<{ data: LoanApplication[]; total: number }> {
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

      // ---- BÚSQUEDA MEJORADA ----
      if (searchQuery && searchQuery.trim() !== '') {
        const cleanSearchQuery = searchQuery.trim();

        // Evaluar si la búsqueda es un número de documento
        const isDocNumberSearch = /^\d+$/.test(cleanSearchQuery);

        let userIdsToInclude: string[] = [];

        // Si parece un número de documento, buscar primero por documento
        if (isDocNumberSearch) {
          const usersWithMatchingDocument = await this.prisma.user.findMany({
            where: {
              Document: {
                some: {
                  number: { contains: cleanSearchQuery }
                }
              }
            },
            select: { id: true }
          });

          userIdsToInclude = usersWithMatchingDocument.map(u => u.id);
        }

        // Si no encontramos usuarios por número de documento o no es un número,
        // realizamos búsqueda por nombre
        if (userIdsToInclude.length === 0 && cleanSearchQuery.length >= 2) {
          // Usar nuestra nueva función especializada de búsqueda por nombre
          userIdsToInclude = await this.searchLoansByUserName(cleanSearchQuery, status);
        }

        // Preparar las condiciones de búsqueda
        const searchConditions: Prisma.LoanApplicationWhereInput[] = [];

        // Incluir búsqueda por ID de préstamo solo si parece un ID
        // Los IDs suelen incluir guiones o tener un formato específico
        const isPossibleId = cleanSearchQuery.includes('-') || /^[a-f0-9-]+$/i.test(cleanSearchQuery);

        if (isPossibleId) {
          searchConditions.push({
            id: { contains: cleanSearchQuery, mode: 'insensitive' as Prisma.QueryMode }
          });
        }

        // Incluir búsqueda por IDs de usuario si encontramos alguna coincidencia
        if (userIdsToInclude.length > 0) {
          searchConditions.push({
            userId: { in: userIdsToInclude }
          });
        }

        // Si no tenemos condiciones de búsqueda, devolver un resultado vacío
        if (searchConditions.length === 0) {
          this.logger.log(`No se encontraron coincidencias para la búsqueda: ${cleanSearchQuery}`);
          return { data: [], total: 0 };
        }

        // Combinar todas las condiciones de búsqueda con OR
        where.OR = searchConditions;
      }
      // ---- FIN DE BÚSQUEDA MEJORADA ----

      // Count total loans matching criteria for pagination
      const totalLoans = await this.prisma.loanApplication.count({
        where
      });

      // Get loan applications with pagination applied
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

      this.logger.log(`Se encontraron ${totalLoans} préstamos que coinciden con los criterios de búsqueda`);
      return { data: loansWithValidUsers, total: totalLoans };
    } catch (error) {
      this.logger.error('Error al obtener préstamos:', error);
      throw new BadRequestException(`Error al obtener las solicitudes de préstamo: ${error.message}`);
    }
  }

  /**
   * Función auxiliar para búsqueda avanzada de préstamos por nombre del usuario
   * Esta función procesa el texto de búsqueda y encuentra usuarios que coincidan
   * con los términos de búsqueda en sus campos de nombre
   */
  private async searchLoansByUserName(
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

  // Método auxiliar para obtener información sobre el archivo ZIP
  private async getZipFileInfo(doc: GeneratedDocuments): Promise<any> {
    try {
      const fileName = doc.publicUrl || `${doc.uploadId}.zip`;

      // Aquí podríamos usar estadísticas del archivo si GCP las proporciona
      // Por ahora, devolvemos información básica
      return {
        name: fileName.split('/').pop() || fileName,
        fileCount: doc.documentTypes?.length || 0,
        size: 'Tamaño no disponible', // GCP no proporciona directamente el tamaño
        modifiedDate: doc.updated_at.toLocaleDateString()
      };
    } catch (error) {
      this.logger.error('Error getting ZIP file info:', error);
      return null;
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
      const fileBuffer = await this.gcpService.downloadZipFromGcs(documentId, document.publicUrl);

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