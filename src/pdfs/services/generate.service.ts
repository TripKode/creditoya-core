import { Injectable, Logger } from "@nestjs/common";
import { DocumentParams } from "../dto/create-pdf.dto";
import { SkeletonPdfServices } from "./skeleton.service";
import * as archiver from 'archiver';

@Injectable()
export class GeneratePDFService {
    private readonly logger = new Logger(GeneratePDFService.name);

    constructor(private readonly skeletons: SkeletonPdfServices) { }

    /**
     * Generates multiple PDFs and packages them into a ZIP file
     */
    async generateMultiplePdfs(documentsParams: Array<DocumentParams>): Promise<Buffer> {
        try {
            const chunks: Buffer[] = [];
            const { Writable } = require('stream');
            const outputStream = new Writable({
                write(chunk: Buffer, _: BufferEncoding, callback: (error?: Error | null) => void): void {
                    chunks.push(chunk);
                    callback();
                }
            });

            const archive = archiver('zip', {
                zlib: { level: 9 } // Maximum compression
            });

            archive.pipe(outputStream);

            // Generate each PDF and add to ZIP
            for (const docParams of documentsParams) {
                const { pdfBuffer, fileName } = await this.generateSinglePdf(docParams);
                archive.append(pdfBuffer, { name: fileName });
            }

            // Finalize the archive
            archive.finalize();

            // Wait for the stream to finish
            await new Promise<void>((resolve) => {
                archive.on('end', () => {
                    outputStream.end();
                    resolve();
                });
            });

            return Buffer.concat(chunks);
        } catch (error) {
            this.logger.error('Error generating multiple PDFs', error);
            throw error;
        }
    }

    /**
     * Generates a single PDF based on document type
     */
    private async generateSinglePdf(docParams: DocumentParams): Promise<{ pdfBuffer: Buffer; fileName: string }> {
        let pdfBuffer: Buffer;
        let fileName: string;

        switch (docParams.documentType) {
            case 'about-loan':
                pdfBuffer = await this.skeletons.generateAboutLoanPdf({
                    signature: docParams.signature,
                    numberDocument: docParams.numberDocument,
                    autoDownload: docParams.autoDownload,
                    entity: docParams.entity as string,
                    accountNumber: docParams.accountNumber as string,
                });
                fileName = `gestion_de_cobro_${docParams.numberDocument}.pdf`;
                break;

            case 'instruction-letter':
                pdfBuffer = await this.skeletons.generateInstructionLetterPdf({
                    signature: docParams.signature,
                    numberDocument: docParams.numberDocument,
                    name: docParams.name
                });
                fileName = `carta_instruccion_${docParams.numberDocument}.pdf`;
                break;

            case 'salary-payment-authorization':
                pdfBuffer = await this.skeletons.generateSalaryPaymentAuthorizationPdf({
                    signature: docParams.signature,
                    numberDocument: docParams.numberDocument,
                    name: docParams.name
                });
                fileName = `autorizacion_pago_${docParams.numberDocument}.pdf`;
                break;

            case 'promissory-note':
                pdfBuffer = await this.skeletons.generatePromissoryNotePdf({
                    signature: docParams.signature,
                    numberDocument: docParams.numberDocument,
                    name: docParams.name
                });
                fileName = `pagare_${docParams.numberDocument}.pdf`;
                break;

            default:
                throw new Error(`Unknown document type: ${(docParams as any).documentType}`);
        }

        return { pdfBuffer, fileName };
    }
}