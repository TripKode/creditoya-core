import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentGenerationParams,
  DocumentParams,
  PromissoryNoteGenerationParams,
} from './dto/create-pdf.dto';
import { GeneratePDFService } from './services/generate.service';
import { DocumentsUploadService } from './services/upload.service';
import { DocumentFilter, QueryService } from './services/query.service';
import { BatchPDFService, BatchProcessingResult } from './services/batch.service';

@Injectable()
export class PdfsService {
  private readonly logger = new Logger(PdfsService.name);

  constructor(
    private readonly pdfGenerationService: GeneratePDFService,
    private readonly documentUploadService: DocumentsUploadService,
    private readonly documentQueryService: QueryService,
    private readonly batchProcessingService: BatchPDFService
  ) { }

  /**
   * Generates multiple PDFs and packages them into a ZIP file
   */
  async generateMultiplePdfs(documentsParams: Array<DocumentParams>): Promise<Buffer> {
    return this.pdfGenerationService.generateMultiplePdfs(documentsParams);
  }

  /**
   * Generates and uploads multiple PDFs as a ZIP file to Google Cloud Storage
   */
  async generateAndUploadPdfs(
    documentsParams: Array<DocumentGenerationParams | PromissoryNoteGenerationParams>,
    userId: string,
    loanId: string,
  ): Promise<{ success: boolean; public_name?: string }> {
    return this.documentUploadService.generateAndUploadPdfs(documentsParams, userId, loanId);
  }

  /**
   * Downloads a specific document
   */
  async downloadDocument(documentId: string): Promise<{
    buffer: Buffer;
    fileName: string;
    contentType: string;
  }> {
    return this.documentUploadService.downloadDocument(documentId);
  }

  /**
   * Lists generated documents for a specific loan ID
   */
  async listDocsGenerates(loanId: string) {
    return this.documentQueryService.listDocsGenerates(loanId);
  }

  /**
   * Lists all documents with their loan applications
   */
  async listDocumentsWithLoans(filters?: DocumentFilter) {
    return this.documentQueryService.listDocumentsWithLoans(filters);
  }

  /**
   * Lists documents that have never been downloaded
   */
  async listNeverDownloadedDocuments(filters?: DocumentFilter) {
    return this.documentQueryService.listNeverDownloadedDocuments(filters);
  }

  /**
   * Lists documents that have been downloaded at least once
   */
  async listDownloadedDocuments(filters?: DocumentFilter) {
    return this.documentQueryService.listDownloadedDocuments(filters);
  }

  /**
   * Finds loan applications that don't have any generated documents
   */
  async findnewDocs() {
    return this.batchProcessingService.findLoansWithoutDocuments();
  }

  /**
   * Automatically generates documents for all pending loan applications
   */
  async generatePendingDocuments(): Promise<BatchProcessingResult> {
    return this.batchProcessingService.generatePendingDocuments();
  }
}