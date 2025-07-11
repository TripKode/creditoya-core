import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { DocumentsUploadService } from "./upload.service";
import { DocumentGenerationParams, PromissoryNoteGenerationParams } from "../dto/create-pdf.dto";

export interface BatchProcessingResult {
    processed: number;
    successful: number;
    failed: number;
    details: Array<{
        loanId: string;
        userId: string;
        name: string;
        status: 'success' | 'error';
        error?: string;
    }>;
}

export interface LoansWithoutDocuments {
    count: number;
    loans: any[];
}

@Injectable()
export class BatchPDFService {
    private readonly logger = new Logger(BatchPDFService.name);

    constructor(
        private readonly prismaService: PrismaService,
        private readonly documentUploadService: DocumentsUploadService
    ) { }

    /**
     * Finds loan applications that don't have any generated documents
     */
    async findLoansWithoutDocuments(): Promise<LoansWithoutDocuments> {
        try {
            const loansWithoutDocs = await this.prismaService.loanApplication.findMany({
                where: {
                    GeneratedDocuments: { none: {} },
                    status: {
                        notIn: ['Borrador', 'Pendiente', 'Aplazado', 'Archivado']
                    }
                },
                include: {
                    user: {
                        select: {
                            names: true,
                            firstLastName: true,
                            secondLastName: true,
                            email: true,
                        }
                    }
                }
            });

            return {
                count: loansWithoutDocs.length,
                loans: loansWithoutDocs
            };
        } catch (error) {
            this.logger.error('Error finding loans without documents', error);
            throw error;
        }
    }

    private async processLoan(loan: any, results: BatchProcessingResult): Promise<void> {
        this.logger.log(`Processing loan ${loan.id} for user ${loan.userId}`);

        this.validateLoanData(loan);

        const userDocument = await this.getUserDocument(loan.userId);
        const fullName = this.formatUserName(loan.user);
        const documentsToGenerate = this.createDocumentParameters(loan, userDocument.number, fullName);

        const result = await this.documentUploadService.generateAndUploadPdfs(
            documentsToGenerate,
            loan.userId,
            loan.id
        );

        if (result.success) {
            this.logger.log(`Successfully generated documents for loan ${loan.id}`);
            results.successful++;
            results.details.push({
                loanId: loan.id,
                userId: loan.userId,
                name: fullName,
                status: 'success'
            });
        } else {
            throw new Error('Document generation failed');
        }
    }

    private validateLoanData(loan: any): void {
        if (loan.status === 'Borrador') {
            throw new Error('Loan is in draft status');
        }

        if (!loan.signature || !loan.userId) {
            throw new Error('Missing required fields: signature or userId');
        }
    }

    private async getUserDocument(userId: string): Promise<any> {
        const userDocument = await this.prismaService.document.findFirst({
            where: { userId }
        });

        if (!userDocument || !userDocument.number) {
            throw new Error('User document not found or missing document number');
        }

        return userDocument;
    }

    private formatUserName(user: any): string {
        return `${user.names} ${user.firstLastName} ${user.secondLastName}`;
    }

    private createDocumentParameters(
        loan: any,
        documentNumber: string,
        fullName: string
    ): Array<DocumentGenerationParams | PromissoryNoteGenerationParams> {
        return [
            {
                documentType: 'about-loan',
                signature: loan.signature,
                numberDocument: documentNumber,
                entity: loan.entity,
                accountNumber: loan.bankNumberAccount,
                name: fullName,
                userId: loan.userId
            },
            {
                documentType: 'instruction-letter',
                signature: loan.signature,
                numberDocument: documentNumber,
                name: fullName,
                userId: loan.userId
            },
            {
                documentType: 'salary-payment-authorization',
                signature: loan.signature,
                numberDocument: documentNumber,
                name: fullName,
                userId: loan.userId,
            },
            {
                documentType: 'promissory-note',
                signature: loan.signature,
                numberDocument: documentNumber,
                name: fullName,
                userId: loan.userId
            }
        ];
    }

    private handleLoanProcessingError(loan: any, error: any, results: BatchProcessingResult): void {
        this.logger.error(`Failed to generate documents for loan ${loan.id}`, error);
        results.failed++;
        results.details.push({
            loanId: loan.id,
            userId: loan.userId,
            name: this.formatUserName(loan.user),
            status: 'error',
            error: error.message || 'Unknown error'
        });
    }
}