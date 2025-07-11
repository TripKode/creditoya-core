import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

export interface DocumentFilter {
    userId?: string;
    loanId?: string;
}

export interface FormattedDocument {
    document: {
        id: string;
        publicUrl: string;
        fileType: string;
        documentTypes: string[];
        created_at: Date;
        updated_at: Date;
    };
    loanApplication: {
        id: string;
        status: string;
        amount: number;
        created_at: Date;
        user: any;
    };
    downloadCount: number;
    lastDownloaded?: Date;
}

@Injectable()
export class QueryService {
    private readonly logger = new Logger(QueryService.name);

    constructor(
        private readonly prismaService: PrismaService,
    ) {
        if (!this.prismaService) {
            this.logger.error('PrismaService no fue inyectado correctamente');
            throw new Error('PrismaService dependency injection failed');
        }
    }

    /**
     * Lists generated documents for a specific loan ID
     */
    async listDocsGenerates(loanId: string) {
        try {
            if (!this.prismaService) {
                throw new Error('PrismaService is not available');
            }

            const generatedDocs = await this.prismaService.generatedDocuments.findMany({
                where: { loanId },
                include: { loan: true },
                orderBy: { created_at: 'desc' }
            });

            return generatedDocs;
        } catch (error) {
            this.logger.error('Error listing generated documents', error);
            throw error;
        }
    }

    /**
     * Lists all documents with their associated loan applications
     */
    async listDocumentsWithLoans(filters?: DocumentFilter): Promise<FormattedDocument[]> {
        try {
            if (!this.prismaService) {
                throw new Error('PrismaService is not available');
            }

            const whereClause = this.buildWhereClause(filters);

            // Primero obtener los IDs de loans válidos
            const validLoanIds = await this.prismaService.loanApplication.findMany({
                select: { id: true }
            });

            const validIds = validLoanIds.map(loan => loan.id);

            const documents = await this.prismaService.generatedDocuments.findMany({
                where: {
                    ...whereClause,
                    loanId: { in: validIds }
                },
                include: {
                    loan: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    names: true,
                                    firstLastName: true,
                                    secondLastName: true,
                                    email: true,
                                    Document: true
                                }
                            },
                            GeneratedDocuments: true,
                        }
                    }
                },
                orderBy: { created_at: 'desc' }
            });

            const formattedResults = this.formatDocumentResults(documents);
            this.logger.log(`Retrieved ${formattedResults.length} documents with loan details`);

            return formattedResults;
        } catch (error) {
            this.logger.error('Error listing documents with loan details', error);
            throw error;
        }
    }

    /**
     * Lists documents that have never been downloaded with pagination
     */
    async listNeverDownloadedDocuments(
        filters?: DocumentFilter,
        page: number = 1,
        limit: number = 10
    ): Promise<{ documents: FormattedDocument[], total: number, totalPages: number, currentPage: number }> {
        try {
            if (!this.prismaService) {
                throw new Error('PrismaService is not available');
            }

            // Obtener los IDs de loans válidos
            const validLoanIds = await this.prismaService.loanApplication.findMany({
                select: { id: true }
            });

            const validIds = validLoanIds.map(loan => loan.id);

            const whereClause = {
                ...this.buildWhereClause(filters),
                downloadCount: 0,
                loanId: { in: validIds }
            };

            // Calcular offset para paginación
            const offset = (page - 1) * limit;

            // Obtener total de documentos para calcular páginas
            const totalDocuments = await this.prismaService.generatedDocuments.count({
                where: whereClause
            });

            // Obtener documentos paginados
            const documents = await this.prismaService.generatedDocuments.findMany({
                where: whereClause,
                include: {
                    loan: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    names: true,
                                    firstLastName: true,
                                    secondLastName: true,
                                    email: true,
                                    Document: true
                                }
                            }
                        }
                    }
                },
                orderBy: { created_at: 'desc' },
                skip: offset,
                take: limit
            });

            const formattedResults = this.formatDocumentResults(documents);
            const totalPages = Math.ceil(totalDocuments / limit);

            this.logger.log(`Retrieved ${formattedResults.length} never-downloaded documents (page ${page}/${totalPages})`);

            return {
                documents: formattedResults,
                total: totalDocuments,
                totalPages: totalPages,
                currentPage: page
            };
        } catch (error) {
            this.logger.error('Error listing never-downloaded documents', error);
            throw error;
        }
    }

    /**
     * Lists documents that have been downloaded at least once
     */
    async listDownloadedDocuments(filters?: DocumentFilter): Promise<FormattedDocument[]> {
        try {
            if (!this.prismaService) {
                throw new Error('PrismaService is not available');
            }

            // Obtener los IDs de loans válidos
            const validLoanIds = await this.prismaService.loanApplication.findMany({
                select: { id: true }
            });

            const validIds = validLoanIds.map(loan => loan.id);

            const whereClause = {
                ...this.buildWhereClause(filters),
                downloadCount: { gte: 1 },
                loanId: { in: validIds }
            };

            const documents = await this.prismaService.generatedDocuments.findMany({
                where: whereClause,
                include: {
                    loan: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    names: true,
                                    firstLastName: true,
                                    secondLastName: true,
                                    email: true,
                                    Document: true
                                }
                            }
                        }
                    }
                },
                orderBy: { updated_at: 'desc' }
            });

            const formattedResults = this.formatDocumentResults(documents);
            this.logger.log(`Retrieved ${formattedResults.length} downloaded documents`);

            return formattedResults;
        } catch (error) {
            this.logger.error('Error listing downloaded documents', error);
            throw error;
        }
    }

    private buildWhereClause(filters?: DocumentFilter): any {
        const whereClause: any = {};

        if (filters?.loanId) {
            whereClause.loanId = filters.loanId;
        }

        if (filters?.userId) {
            whereClause.loan = {
                userId: filters.userId
            };
        }

        return whereClause;
    }

    private formatDocumentResults(documents: any[]): FormattedDocument[] {
        return documents.map(doc => ({
            document: {
                id: doc.id,
                publicUrl: doc.publicUrl,
                fileType: doc.fileType,
                documentTypes: doc.documentTypes,
                created_at: doc.created_at,
                updated_at: doc.updated_at
            },
            loanApplication: {
                id: doc.loan.id,
                status: doc.loan.status,
                amount: doc.loan.cantity,
                created_at: doc.loan.created_at,
                user: doc.loan.user
            },
            downloadCount: doc.downloadCount || 0,
            lastDownloaded: doc.updated_at
        }));
    }
}