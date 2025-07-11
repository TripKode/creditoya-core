import { Injectable, Logger } from "@nestjs/common";
import { DocumentGenerationParams, PromissoryNoteGenerationParams } from "../dto/create-pdf.dto";
import { GoogleCloudService } from "src/gcp/gcp.service";
import { PrismaService } from "src/prisma/prisma.service";
import { GeneratePDFService } from "./generate.service";
import { TransformerPDFService } from "./transformer.service";
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DocumentsUploadService {
    private readonly logger = new Logger(DocumentsUploadService.name);

    constructor(
        private readonly googleCloudService: GoogleCloudService,
        private readonly prismaService: PrismaService,
        private readonly pdfGenerationService: GeneratePDFService,
        private readonly documentTransformer: TransformerPDFService
    ) { }

    /**
     * Generates and uploads multiple PDFs as a ZIP file to Google Cloud Storage
     * and creates a database record linking them to a loan application
     */
    async generateAndUploadPdfs(
        documentsParams: Array<DocumentGenerationParams | PromissoryNoteGenerationParams>,
        userId: string,
        loanId: string,
    ): Promise<{ success: boolean; public_name?: string }> {
        try {
            // Transform document parameters
            const processedParams = this.documentTransformer.transformParameters(documentsParams);

            // Generate ZIP with PDFs
            const zipBuffer = await this.pdfGenerationService.generateMultiplePdfs(processedParams);

            // Create multer-compatible file object
            const multerFile = this.createMulterFile(zipBuffer);

            // Upload to Google Cloud Storage
            const uploadId = uuidv4();
            const result = await this.googleCloudService.uploadToGcs({
                file: multerFile,
                userId,
                name: 'documents',
                upId: uploadId,
                contentType: 'application/zip',
                isBackup: true
            });

            // Create database record
            await this.createDatabaseRecord(loanId, uploadId, result.public_name, documentsParams);

            return result;
        } catch (error) {
            this.logger.error('Error generating and uploading PDFs', error);
            throw error;
        }
    }

    /**
     * Download a specific document from Google Cloud Storage
     */
    async downloadDocument(documentId: string): Promise<{
        buffer: Buffer;
        fileName: string;
        contentType: string;
    }> {
        try {
            const document = await this.prismaService.generatedDocuments.findUnique({
                where: { id: documentId }
            });

            if (!document || !document.publicUrl) {
                throw new Error('Document not found or public URL is missing');
            }

            const filePath = this.extractFilePathFromUrl(document.publicUrl);

            this.logger.log(`Downloading file: ${filePath}`);

            const fileBuffer = await this.googleCloudService.downloadZipFromGcs(
                documentId,
                filePath
            );

            // Update download count
            await this.prismaService.generatedDocuments.update({
                where: { id: documentId },
                data: { downloadCount: { increment: 1 } }
            });

            const fileName = filePath.split('/').pop() || `documents_${documentId}.zip`;

            this.logger.log(`Document ${documentId} downloaded successfully`);

            return {
                buffer: fileBuffer,
                fileName,
                contentType: document.fileType
            };
        } catch (error) {
            this.logger.error(`Error downloading document ${documentId}`, error);
            throw error;
        }
    }

    private createMulterFile(zipBuffer: Buffer): Express.Multer.File {
        return {
            fieldname: 'file',
            originalname: 'documents.zip',
            encoding: '7bit',
            mimetype: 'application/zip',
            buffer: zipBuffer,
            size: zipBuffer.length,
            stream: null as any,
            destination: null as any,
            filename: null as any,
            path: null as any
        };
    }

    private async createDatabaseRecord(
        loanId: string,
        uploadId: string,
        publicUrl: string,
        documentsParams: Array<DocumentGenerationParams | PromissoryNoteGenerationParams>
    ): Promise<void> {
        const documentTypes = documentsParams.map(param => {
            if ('documentType' in param) {
                return param.documentType;
            }
            return 'general-document';
        });

        await this.prismaService.generatedDocuments.create({
            data: {
                loanId,
                uploadId,
                publicUrl,
                documentTypes,
                fileType: 'application/zip',
            },
        });
    }

    private extractFilePathFromUrl(publicUrl: string): string {
        const bucketName = process.env.NAME_BUCKET_GOOGLE_STORAGE as string;
        const baseUrl = `https://storage.googleapis.com/${bucketName}/`;

        if (publicUrl.startsWith(baseUrl)) {
            return publicUrl.replace(baseUrl, '');
        }
        return publicUrl;
    }
}