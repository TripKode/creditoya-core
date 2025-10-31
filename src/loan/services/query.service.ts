import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { LoanApplication, Prisma, StatusLoan } from "@prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { UtilityService } from "./utility.service";

@Injectable()
export class QueryService {
    private logger = new Logger(QueryService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly utility: UtilityService
    ) { }

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
                    userIdsToInclude = await this.utility.searchLoansByUserName(cleanSearchQuery, null);
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

    /**
     * Método para obtener la última solicitud de préstamo creada por un usuario específico
     * @param userId - El ID del usuario cuya última solicitud de préstamo queremos obtener
     * @returns La última solicitud de préstamo del usuario o null si no existe ninguna
     */
    async getLatestLoanByUserId(userId: string): Promise<LoanApplication | null> {
        try {
            // Verificar que el usuario existe
            const userExists = await this.prisma.user.findUnique({
                where: { id: userId }
            });

            if (!userExists) {
                throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
            }

            // Buscar la solicitud de préstamo más reciente del usuario
            const latestLoan = await this.prisma.loanApplication.findFirst({
                where: { userId },
                include: { EventLoanApplication: true },
                orderBy: {
                    created_at: 'desc'
                }
            });

            this.logger.log(`Buscando la última solicitud de préstamo para el usuario ${userId}`);

            // Si no se encuentra ninguna solicitud, devolver null
            if (!latestLoan) {
                this.logger.log(`No se encontraron solicitudes de préstamo para el usuario ${userId}`);
                return null;
            }

            return latestLoan;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Error al obtener la última solicitud de préstamo del usuario ${userId}:`, error);
            throw new BadRequestException(`Error al obtener la última solicitud de préstamo: ${error.message}`);
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

    async pendingLoanDisbursement(page: number, pageSize: number, search?: string) {
        const skip = (page - 1) * pageSize;

        const whereClause: any = {
            status: 'Aprobado',
            isDisbursed: false,
        };

        if (search) {
            whereClause.OR = [
                { user: { names: { contains: search, mode: 'insensitive' } } },
                { user: { firstLastName: { contains: search, mode: 'insensitive' } } },
                { user: { secondLastName: { contains: search, mode: 'insensitive' } } },
                { phone: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [data, total] = await this.prisma.$transaction([
            this.prisma.loanApplication.findMany({
                skip,
                take: pageSize,
                where: whereClause,
                include: {
                    user: true,
                },
                orderBy: { created_at: 'desc' },
            }),
            this.prisma.loanApplication.count({ where: whereClause }),
        ]);

        return { data, total };
    }

    // Maintain backward compatibility with wrapper methods
    async getDeferredLoans(
        page: number = 1,
        pageSize: number = 10,
        searchQuery?: string
    ): Promise<{ data: LoanApplication[]; total: number }> {
        return this.getLoans(StatusLoan.Aplazado, page, pageSize, searchQuery);
    }

    // Modified getApprovedLoans method that starts the fix process
    async getApprovedLoans(
        page: number = 1,
        pageSize: number = 10,
        searchQuery?: string,
    ): Promise<{ data: LoanApplication[]; total: number }> {
        return this.getLoans(StatusLoan.Aprobado, page, pageSize, searchQuery);
    }

    // Enhanced version with fixed queryRaw implementation and dynamic company handling
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
                    // Usar nuestra función especializada de búsqueda por nombre
                    userIdsToInclude = await this.utility.searchLoansByUserName(cleanSearchQuery, status);
                }

                // Preparar las condiciones de búsqueda
                const searchConditions: Prisma.LoanApplicationWhereInput[] = [];

                // Incluir búsqueda por ID de préstamo solo si parece un ID
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

            // Use findMany instead of $queryRaw for type safety
            const loans = await this.prisma.loanApplication.findMany({
                where,
                include: {
                    user: true
                },
                orderBy: {
                    created_at: 'desc'
                },
                skip,
                take: pageSize
            });

            // Procesar los resultados y manejar el mapeo de con_alta a conalta
            const formattedLoans = loans.map((loan: any) => {
                // Normalizar el valor de currentCompanie
                let normalizedCompanie = loan.user?.currentCompanie;
                if (normalizedCompanie === 'con_alta') {
                    normalizedCompanie = 'conalta';
                }

                return {
                    id: loan.id,
                    userId: loan.userId,
                    employeeId: loan.employeeId,
                    fisrt_flyer: loan.fisrt_flyer,
                    upid_first_flyer: loan.upid_first_flyer,
                    second_flyer: loan.second_flyer,
                    upid_second_flyer: loan.upid_second_flyer,
                    third_flyer: loan.third_flyer,
                    upid_third_flyer: loan.upid_third_flyer,
                    reasonReject: loan.reasonReject,
                    reasonChangeCantity: loan.reasonChangeCantity,
                    phone: loan.phone,
                    cantity: loan.cantity,
                    city: loan.city,
                    residence_address: loan.residence_address,
                    newCantity: loan.newCantity,
                    newCantityOpt: loan.newCantityOpt,
                    bankSavingAccount: loan.bankSavingAccount,
                    bankNumberAccount: loan.bankNumberAccount,
                    entity: loan.entity,
                    labor_card: loan.labor_card,
                    upid_labor_card: loan.upid_labor_card,
                    terms_and_conditions: loan.terms_and_conditions,
                    signature: loan.signature,
                    isDisbursed: loan.isDisbursed,
                    dateDisbursed: loan.dateDisbursed,
                    upSignatureId: loan.upSignatureId,
                    status: loan.status,
                    cycode: loan.cycode,
                    extract: loan.extract,
                    created_at: loan.created_at,
                    updated_at: loan.updated_at,
                    user: loan.user ? {
                        id: loan.user.id,
                        email: loan.user.email,
                        names: loan.user.names,
                        firstLastName: loan.user.firstLastName,
                        secondLastName: loan.user.secondLastName,
                        phone_whatsapp: loan.user.phone_whatsapp,
                        residence_phone_number: loan.user.residence_phone_number,
                        birth_day: loan.user.birth_day,
                        genre: loan.user.genre,
                        residence_address: loan.user.residence_address,
                        city: loan.user.city,
                        currentCompanie: normalizedCompanie, // Usar el valor normalizado
                        avatar: loan.user.avatar,
                        isBan: loan.user.isBan,
                        createdAt: loan.user.createdAt,
                        updatedAt: loan.user.updatedAt,
                    } : null
                };
            });

            return {
                data: formattedLoans,
                total: totalLoans
            };
        } catch (error) {
            this.logger.error('Error al obtener préstamos:', error);
            throw new BadRequestException(`Error al obtener las solicitudes de préstamo: ${error.message}`);
        }
    }

}