import { Inject, Injectable, Logger } from '@nestjs/common';
import { GoogleCloudService } from 'src/gcp/gcp.service';
import { jsPDF } from 'jspdf';
import { v4 as uuidv4 } from 'uuid';
import {
  DocumentGenerationParams,
  DocumentParams,
  PromissoryNoteGenerationParams,
  SkeletonJson00Type,
  SkeletonJson01Type,
  SkeletonJson02Type,
  SkeletonJson03Type,
  SkeletonSubJson02Type,
  TextOptions
} from './dto/create-pdf.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import * as archiver from 'archiver';

import {
  SKELETON_JSON_00,
  SKELETON_JSON_01,
  SKELETON_JSON_02,
  SKELETON_JSON_03,
  SKELETON_SUB_JSON_02,
} from 'templates/AboutPdf';
import { BankTypes, handleKeyToString } from 'handlers/bank-to-string';

@Injectable()
export class PdfsService {
  private readonly logger = new Logger(PdfsService.name);

  constructor(
    private readonly googleCloudService: GoogleCloudService,
    private readonly prismaService: PrismaService,
    @Inject(SKELETON_JSON_00)
    private readonly Skeleton00: SkeletonJson00Type,
    @Inject(SKELETON_JSON_01)
    private readonly Skeleton01: SkeletonJson01Type,
    @Inject(SKELETON_JSON_02)
    private readonly Skeleton02: SkeletonJson02Type,
    @Inject(SKELETON_SUB_JSON_02)
    private readonly SkeletonSub02: SkeletonSubJson02Type,
    @Inject(SKELETON_JSON_03)
    private readonly Skeleton03: SkeletonJson03Type,
  ) { }

  /**
   * Adds text to the PDF document with the provided options
   */
  private addText(
    doc: jsPDF,
    text: string,
    x: number,
    y: number,
    options?: TextOptions,
  ) {
    doc.text(text, x, y, options);
  }

  /**
   * Loads an image from a Base64 string or URL
   */
  private async loadImage(src: string): Promise<Buffer> {
    if (src.startsWith('data:image')) {
      // Handle Base64 image
      const base64Data = src.split(',')[1];
      return Buffer.from(base64Data, 'base64');
    } else {
      // Handle URL image
      const response = await fetch(src);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  }

  /**
   * Adds a signature image to the PDF
   */
  private addSignature(
    doc: jsPDF,
    imgBuffer: Buffer,
    x: number,
    y: number,
    label: string,
  ) {
    // Convert Buffer to base64 string
    const base64Img = imgBuffer.toString('base64');

    // Calculate dimensions
    const imgWidth = 50;
    // For simplicity, assume height is proportional (1:1)
    const imgHeight = 20;

    doc.addImage(`data:image/png;base64,${base64Img}`, 'PNG', x, y, imgWidth, imgHeight);
    const lineY = y + imgHeight + 2;
    doc.line(x, lineY, x + imgWidth, lineY);
    this.addText(doc, label, x, lineY + 6);
  }

  /**
   * Generates an "About Loan" PDF document
   * @param params The parameters for generating the PDF
   * @returns Buffer containing the generated PDF
   */
  public async generateAboutLoanPdf(params: {
    signature: string;
    numberDocument: string;
    entity: string,
    accountNumber: string,
    autoDownload?: boolean;
  }): Promise<Buffer> {
    const { signature, numberDocument, entity, accountNumber } = params;
    const jsonData = this.Skeleton00;
    const doc = new jsPDF();
    doc.setFontSize(10);
    let y = 15;

    // First page content
    this.addText(
      doc,
      `${jsonData.TitlePrevExplain}${jsonData.prevExplain}`,
      10,
      y,
      { maxWidth: 190 }
    );
    y += 90;

    this.addText(
      doc,
      `${jsonData.headerTitle} ${jsonData.firstExplainText}`,
      10,
      y,
      { maxWidth: 190 }
    );
    y += 167;

    this.addText(doc, jsonData.secondTitle, 10, y, { maxWidth: 190 });
    y += 10;

    doc.setFontSize(13);
    this.addText(
      doc,
      `Cuenta Ahorros Nro. Cuenta ${accountNumber} Entidad: ${handleKeyToString(entity as BankTypes)}`,
      10,
      y,
      { maxWidth: 190 }
    );

    // Second page content
    doc.addPage();
    doc.setFontSize(10);
    y = 15; // Reset y position for the new page

    this.addText(doc, jsonData.threeTitle, 10, y, { maxWidth: 190 });
    y += 5;

    this.addText(doc, jsonData.justifyText, 10, y, { maxWidth: 190 });
    y += 15;

    this.addText(doc, jsonData.numberOnce + jsonData.textOnce, 10, y, {
      maxWidth: 190,
    });
    y += 25;

    this.addText(doc, jsonData.finalTitle, 10, y, { maxWidth: 190 });
    y += 6;

    this.addText(doc, jsonData.subFinalText, 10, y, { maxWidth: 190 });
    y += 65;

    this.addText(doc, jsonData.finalText, 10, y, { maxWidth: 190 });
    y += 10;

    // Add signature if provided
    if (signature) {
      try {
        const img = await this.loadImage(signature);
        this.addSignature(doc, img, 10, y, "Firma del solicitante");

        const docX = 70;
        const docY = y + 22; // Standard offset instead of the complex calculation
        this.addText(doc, numberDocument, docX, docY);
        doc.line(docX, docY + 2, docX + 40, docY + 2);
        this.addText(doc, "C.C.", docX, docY + 6);
      } catch (error) {
        this.logger.error("Error loading signature image", error);
        throw error;
      }
    }

    // Return the PDF as a buffer
    return Buffer.from(doc.output('arraybuffer'));
  }

  /**
   * Generates a PDF document for an instruction letter with signature
   * @param params The parameters for generating the PDF
   * @returns Buffer containing the generated PDF
   */
  async generateInstructionLetterPdf(params: {
    signature: string;
    numberDocument: string;
    name: string;
  }): Promise<Buffer> {
    const { signature, numberDocument, name } = params;
    const jsonData = this.Skeleton01;
    const doc = new jsPDF();

    // Helper function to add a signature and document info
    const addSignatureAndDocument = async (
      yPosition: number,
      signature: string,
      name: string,
      numberDocument: string
    ) => {
      try {
        const img = await this.loadImage(signature);
        const imgWidth = 50;
        const imgHeight = 20;

        // Convert Buffer to base64 string
        const base64Img = img.toString('base64');

        // Add signature image
        doc.addImage(`data:image/png;base64,${base64Img}`, 'PNG', 10, yPosition, imgWidth, imgHeight);

        // Add line under signature
        const lineY = yPosition + imgHeight + 2;
        doc.line(10, lineY, 10 + imgWidth, lineY);

        // Add text labels
        this.addText(doc, "Firma del solicitante", 10, lineY + 6);
        this.addText(doc, "Nombre: " + name, 10, lineY + 11);
        this.addText(doc, "Identificación: " + numberDocument, 10, lineY + 16);
      } catch (error) {
        this.logger.error("Error adding signature to PDF", error);
        throw error;
      }
    };

    // Begin creating PDF
    doc.setFontSize(10);
    let y = 15; // Initial Y position

    // First page
    this.addText(doc, jsonData.firstParagraph, 10, y, { maxWidth: 190 });
    y += 95;

    this.addText(
      doc,
      jsonData.firstText +
      `__________________________________________,` +
      jsonData.secondText +
      `______________________, ` +
      jsonData.secondParagraph,
      10,
      y,
      { maxWidth: 190 }
    );
    y += 40;

    this.addText(doc, jsonData.inst01, 20, y, { maxWidth: 180 });
    y += 15;

    this.addText(doc, jsonData.inst02, 20, y, { maxWidth: 180 });
    y += 30;

    this.addText(doc, jsonData.inst03, 20, y, { maxWidth: 180 });
    y += 15;

    this.addText(doc, jsonData.inst04, 20, y, { maxWidth: 180 });
    y += 15;

    this.addText(doc, jsonData.inst05, 20, y, { maxWidth: 180 });
    y += 15;

    this.addText(doc, jsonData.finalSecondParagraph, 10, y, { maxWidth: 180 });
    y += 10;

    // Add signature to first page
    await addSignatureAndDocument(y, signature, name, numberDocument);

    // Second page
    doc.addPage();
    y = 15; // Reset Y position for second page

    this.addText(doc, jsonData.threeParagraph, 10, y, { maxWidth: 190 });
    y += 35;

    this.addText(doc, jsonData.fourParagraph, 10, y, { maxWidth: 190 });
    y += 15;

    // Add signature to second page
    await addSignatureAndDocument(y, signature, name, numberDocument);

    // Return PDF as buffer
    return Buffer.from(doc.output('arraybuffer'));
  }

  /**
   * Generates a PDF document for salary payment authorization with signature
   * @param params The parameters for generating the PDF
   * @returns Buffer containing the generated PDF
   */
  async generateSalaryPaymentAuthorizationPdf(params: {
    signature: string;
    numberDocument: string;
    name: string;
  }): Promise<Buffer> {
    const { signature, numberDocument, name } = params;
    const skeletonPdf = this.Skeleton02
    const sub_skeletonPdf = this.SkeletonSub02;
    const doc = new jsPDF();

    /**
     * Adds signature and document details to the PDF
     */
    const addSignatureAndDocument = async (yPosition: number, signature: string) => {
      try {
        const img = await this.loadImage(signature);

        // Convert Buffer to base64 string
        const base64Img = img.toString('base64');

        const imgWidth = 50;
        const imgHeight = 20;

        // Add signature image
        doc.addImage(`data:image/png;base64,${base64Img}`, 'PNG', 10, yPosition, imgWidth, imgHeight);

        // Add line under signature
        const lineY = yPosition + imgHeight + 2;
        doc.line(10, lineY, 10 + imgWidth, lineY);

        // Add signature label
        this.addText(doc, "Firma del solicitante", 10, lineY + 6);

        // Add document number
        const docX = 70;
        const docY = yPosition + imgHeight / 1;
        this.addText(doc, numberDocument, docX, docY);
        doc.line(docX, docY + 2, docX + 40, docY + 2);
        this.addText(doc, "C.C.", docX, docY + 6);
      } catch (error) {
        this.logger.error("Error adding signature to PDF", error);
        throw error;
      }
    };

    // Begin creating PDF
    doc.setFontSize(10);

    // First page - Salary Payment Authorization
    let y = 8;
    this.addText(doc, skeletonPdf.title, 10, y, { maxWidth: 190 });
    y += 8;

    this.addText(doc, skeletonPdf.firstParagraph + " ______________________", 10, y, {
      maxWidth: 190,
    });
    y += 5;

    this.addText(doc, skeletonPdf.subFirstParagraph, 10, y, {
      maxWidth: 190,
    });
    y += 50;

    this.addText(doc, skeletonPdf.secondParagraph, 10, y, { maxWidth: 190 });
    y += 30;

    this.addText(doc, skeletonPdf.thirdParagraph, 10, y, { maxWidth: 190 });
    y += 49;

    this.addText(
      doc,
      skeletonPdf.footer +
      " _________________ a los ___________ dias del mes de ___________ de _____________.",
      10,
      y,
      { maxWidth: 190 }
    );
    y += 20;

    // Add signature to first page
    await addSignatureAndDocument(y, signature);

    // Second page - Supplemental document
    doc.addPage();
    let y2 = 8;

    this.addText(doc, sub_skeletonPdf.title, 10, y2, { maxWidth: 190 });
    y2 += 10;

    this.addText(
      doc,
      sub_skeletonPdf.firstParagraph + " ______________________",
      10,
      y2,
      { maxWidth: 190 }
    );
    y2 += 4;

    this.addText(
      doc,
      sub_skeletonPdf.subFirstParagraph +
      " $ ____________________LETRAS (___________________) " +
      sub_skeletonPdf.TwoSubFirstParagraph +
      "____" +
      sub_skeletonPdf.ThreeSubFirstParagraph +
      " $____________________LETRAS(____________________________________) " +
      sub_skeletonPdf.FourSubFirstParagraph +
      "______" +
      sub_skeletonPdf.FiveSubFirstParagraph,
      10,
      y2,
      { maxWidth: 190 }
    );
    y2 += 53;

    this.addText(doc, sub_skeletonPdf.secondParagraph, 10, y2, { maxWidth: 190 });
    y2 += 30;

    this.addText(doc, sub_skeletonPdf.thirdParagraph, 10, y2, { maxWidth: 190 });
    y2 += 53;

    this.addText(
      doc,
      sub_skeletonPdf.footer +
      " ________________ a los _____________________ dias del mes de ______________________ de ____________",
      10,
      y2,
      { maxWidth: 190 }
    );
    y2 += 20;

    // Add signature to second page
    await addSignatureAndDocument(y2, signature);

    // Return PDF as buffer
    return Buffer.from(doc.output('arraybuffer'));
  }

  /**
   * Generates a PDF document for a promissory note with logo and signature
   * @param params The parameters for generating the PDF
   * @returns Buffer containing the generated PDF
   */
  async generatePromissoryNotePdf(params: {
    signature: string;
    numberDocument: string;
    name: string;
  }): Promise<Buffer> {
    const { signature, numberDocument, name } = params;
    const skeletonPdf = this.Skeleton03;
    const doc = new jsPDF();

    try {
      // Update JSON data with provided information
      const jsonData = { ...skeletonPdf };
      jsonData.firstParagraph.namePerson = name;
      jsonData.firstParagraph.numberDocument = numberDocument;

      // Starting position
      let y = 8;

      // Add logo if available
      if (jsonData.logoHeader) {
        const logoBuffer = await this.loadImage(jsonData.logoHeader);
        const base64Logo = logoBuffer.toString('base64');

        const imgWidth = 70;
        const imgHeight = 20; // Fixed height for consistent positioning

        doc.addImage(`data:image/png;base64,${base64Logo}`, 'PNG', 10, y, imgWidth, imgHeight);
        y += 28;
      }

      // Add text content
      doc.setFontSize(10);

      // Promissory note number and due date
      this.addText(doc, jsonData.numero_pagare.publicText + " _________________", 10, y);
      y += 10;

      this.addText(doc, jsonData.fecha_vencimiento.publicText + " _________________", 10, y);
      y += 10;

      // First paragraph with debtor information
      const firstParagraph = `${name} ${jsonData.firstParagraph.publicfirstText} ${numberDocument} ${jsonData.firstParagraph.publicSecondText} _________________ ${jsonData.firstParagraph.publicFiveText} _________________`;
      this.addText(doc, firstParagraph, 10, y, { maxWidth: 190 });
      y += 15;

      // Terms and conditions paragraphs
      this.addText(doc, jsonData.secondParagraph, 10, y, { maxWidth: 180 });
      y += 68;

      this.addText(doc, jsonData.threeParagraph, 10, y, { maxWidth: 180 });
      y += 25;

      this.addText(doc, jsonData.fourParagraph, 10, y, { maxWidth: 180 });
      y += 85;

      // Final paragraph with date
      const fiveParagraph = `${jsonData.fiveParagraph.publicFirstText} ${jsonData.fiveParagraph.publicSecondText} _________________`;
      this.addText(doc, fiveParagraph, 10, y, { maxWidth: 190 });
      y += 10;

      // Add signature
      if (signature) {
        const img = await this.loadImage(signature);
        const base64Img = img.toString('base64');

        const sigWidth = 50;
        const sigHeight = 20;

        doc.addImage(`data:image/png;base64,${base64Img}`, 'PNG', 10, y, sigWidth, sigHeight);

        // Add line and text under signature
        const lineY = y + sigHeight + 2;
        doc.line(10, lineY, 10 + sigWidth, lineY);
        this.addText(doc, "Firma del solicitante", 10, lineY + 6);

        // Add document number beside signature
        const docX = 70;
        const docY = y + sigHeight / 1;
        this.addText(doc, numberDocument, docX, docY);
        doc.line(docX, docY + 2, docX + 40, docY + 2);
        this.addText(doc, "C.C.", docX, docY + 6);
      }

      // Return PDF as buffer
      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      this.logger.error('Error generating promissory note PDF', error);
      throw error;
    }
  }

  /**
   * Generates multiple PDFs and packages them into a ZIP file
   */
  async generateMultiplePdfs(
    documentsParams: Array<DocumentParams>
  ): Promise<Buffer> {
    try {
      // Crear un buffer donde almacenaremos el contenido del ZIP
      const chunks: Buffer[] = [];
      const { Writable } = require('stream');
      const outputStream = new Writable({
        write(chunk: Buffer, _: BufferEncoding, callback: (error?: Error | null) => void): void {
          chunks.push(chunk);
          callback();
        }
      });

      // Recolectar chunks en un array para luego concatenarlos
      outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));

      // Crear y configurar el archivo zip
      const archive = archiver('zip', {
        zlib: { level: 9 } // Máxima compresión
      });

      // Conectar el archivo al stream de salida
      archive.pipe(outputStream);

      // Generate each PDF and add to ZIP
      for (const docParams of documentsParams) {
        let pdfBuffer: Buffer;
        let fileName: string;

        switch (docParams.documentType) {
          case 'about-loan':
            pdfBuffer = await this.generateAboutLoanPdf({
              signature: docParams.signature,
              numberDocument: docParams.numberDocument,
              autoDownload: docParams.autoDownload,
              entity: docParams.entity as string,
              accountNumber: docParams.accountNumber as string,
            });
            fileName = `sobre_prestamo_${docParams.numberDocument}.pdf`;
            break;

          case 'instruction-letter':
            pdfBuffer = await this.generateInstructionLetterPdf({
              signature: docParams.signature,
              numberDocument: docParams.numberDocument,
              name: docParams.name
            });
            fileName = `carta_instruccion_${docParams.numberDocument}.pdf`;
            break;

          case 'salary-payment-authorization':
            pdfBuffer = await this.generateSalaryPaymentAuthorizationPdf({
              signature: docParams.signature,
              numberDocument: docParams.numberDocument,
              name: docParams.name
            });
            fileName = `autorizacion_pago_${docParams.numberDocument}.pdf`;
            break;

          case 'promissory-note':
            pdfBuffer = await this.generatePromissoryNotePdf({
              signature: docParams.signature,
              numberDocument: docParams.numberDocument,
              name: docParams.name
            });
            fileName = `pagare_${docParams.numberDocument}.pdf`;
            break;

          default:
            throw new Error(`Unknown document type: ${(docParams as any).documentType}`);
        }

        // Añadir el buffer del PDF al archivo ZIP
        archive.append(pdfBuffer, { name: fileName });
      }

      // Finalizar el archivo y esperar a que termine la escritura
      archive.finalize();

      // Esperar a que termine la escritura del stream
      await new Promise<void>((resolve) => {
        archive.on('end', () => {
          outputStream.end(); // Finalizar el stream correctamente
          resolve();
        });
      });

      // Convertir los chunks recolectados en un único Buffer
      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error('Error generating multiple PDFs', error);
      throw error;
    }
  }

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
      // Transform document parameters to the format expected by generateMultiplePdfs
      const processedParams = documentsParams.map(param => {
        // This is where we adapt from your existing types to our new unified type
        const documentType = 'documentType' in param ? param.documentType :
          ('name' in param ? 'promissory-note' : 'about-loan');

        // Cast to any to allow assignment to our new type
        const transformedParam: any = {
          documentType,
          signature: param.signature,
          numberDocument: param.numberDocument,
          accountNumber: 'accountNumber' in param ? param.accountNumber : undefined,
          entity: 'entity' in param ? param.entity : undefined,
        };

        // Add optional parameters if present
        if ('name' in param && param.name) {
          transformedParam.name = param.name;
        }

        if ('autoDownload' in param) {
          transformedParam.autoDownload = param.autoDownload;
        }

        if ('entity' in param) {
          transformedParam.entity = param.entity;
        }

        if ('accountNumber' in param) {
          transformedParam.numberAccount = param.accountNumber;
        }

        return transformedParam as DocumentParams;
      });

      // Generate ZIP with PDFs
      const zipBuffer = await this.generateMultiplePdfs(processedParams);

      // Create a File object from the ZIP buffer with explicit ZIP MIME type
      const blob = new Blob([zipBuffer], { type: 'application/zip' });
      const file = new File([blob], 'documents.zip', { type: 'application/zip' });

      // Upload to Google Cloud Storage with explicit content type
      const uploadId = uuidv4();
      const result = await this.googleCloudService.uploadToGcs({
        file,
        userId,
        name: 'documents',
        upId: uploadId,
        contentType: 'application/zip', // Explicitly set the content type
      });

      // Extract document types for record keeping
      const documentTypes = documentsParams.map(param => {
        if ('documentType' in param) {
          return param.documentType;
        } else {
          return 'general-document';
        }
      });

      // Create record in database
      await this.prismaService.generatedDocuments.create({
        data: {
          loanId,
          uploadId,
          publicUrl: result.public_name,
          documentTypes,
          fileType: 'application/zip',
        },
      });

      return result;
    } catch (error) {
      this.logger.error('Error generating and uploading PDFs', error);
      throw error;
    }
  }

  /**
   * Lists generated documents for a specific loan ID
   * @param loanId The loan ID to get documents for
   * @returns Array of GeneratedDocuments associated with the loanId
   */
  async listDocsGenerates(loanId: string) {
    try {
      const generatedDocs = await this.prismaService.generatedDocuments.findMany({
        where: {
          loanId: loanId
        },
        include: {
          loan: true
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      return generatedDocs;
    } catch (error) {
      this.logger.error('Error listing generated documents', error);
      throw error;
    }
  }

  /**
   * Finds loan applications that don't have any generated documents
   * @returns Array of loan applications without associated documents
   */
  async findnewDocs() {
    try {
      // Find all loans that don't have any generated documents
      const loansWithoutDocs = await this.prismaService.loanApplication.findMany({
        where: {
          GeneratedDocuments: {
            none: {}
          },
          status: {
            notIn: ['Borrador', 'Pendiente', 'Aplazado', 'Archivado'] // Exclude draft loans
          }
        },
        include: {
          user: {
            select: {
              names: true,
              firstLastName: true,
              secondLastName: true,
              email: true,
              phone: true
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

  /**
   * Automatically generates documents for all pending loan applications that don't have documents
   * @returns Summary of document generation process
   */
  async generatePendingDocuments(): Promise<{
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
  }> {
    this.logger.log('Starting batch generation of pending documents');

    // Find all loans without documents
    const { loans } = await this.findnewDocs();

    const results: {
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
    } = {
      processed: loans.length,
      successful: 0,
      failed: 0,
      details: []
    };

    // Process each loan
    for (const loan of loans) {
      try {
        this.logger.log(`Processing loan ${loan.id} for user ${loan.userId}`);

        // Skip draft loans
        if (loan.status === 'Borrador') {
          this.logger.log(`Skipping loan ${loan.id} - status is draft`);
          continue;
        }

        // Verify required fields are present
        if (!loan.signature || !loan.userId) {
          throw new Error('Missing required fields: signature or userId');
        }

        // Get user document number
        const userDocument = await this.prismaService.document.findFirst({
          where: { userId: loan.userId }
        });

        if (!userDocument || !userDocument.number) {
          throw new Error('User document not found or missing document number');
        }

        // Format user name
        const fullName = `${loan.user.names} ${loan.user.firstLastName} ${loan.user.secondLastName}`;

        // Create array of document parameters to generate
        const documentsToGenerate: Array<DocumentGenerationParams | PromissoryNoteGenerationParams> = [
          {
            documentType: 'about-loan',
            signature: loan.signature,
            numberDocument: userDocument.number,
            entity: loan.entity,
            accountNumber: loan.bankNumberAccount,
            name: fullName,
            userId: loan.userId
          },
          {
            documentType: 'instruction-letter',
            signature: loan.signature,
            numberDocument: userDocument.number,
            name: fullName,
            userId: loan.userId
          },
          {
            documentType: 'salary-payment-authorization',
            signature: loan.signature,
            numberDocument: userDocument.number,
            name: fullName,
            userId: loan.userId,
          },
          {
            documentType: 'promissory-note',
            signature: loan.signature,
            numberDocument: userDocument.number,
            name: fullName,
            userId: loan.userId
          }
        ];

        // Generate and upload documents
        const result = await this.generateAndUploadPdfs(
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
      } catch (error) {
        this.logger.error(`Failed to generate documents for loan ${loan.id}`, error);
        results.failed++;
        results.details.push({
          loanId: loan.id,
          userId: loan.userId,
          name: `${loan.user.names} ${loan.user.firstLastName}`,
          status: 'error',
          error: error.message || 'Unknown error'
        });
      }
    }

    this.logger.log(`Batch document generation complete. Successful: ${results.successful}, Failed: ${results.failed}`);
    return results;
  }

  /**
   * Download a specific document or group of documents related to a loan
   * @param documentId The ID of the generated document to download
   * @returns The document buffer and metadata
   */
  async downloadDocument(documentId: string): Promise<{
    buffer: Buffer;
    fileName: string;
    contentType: string;
  }> {
    try {
      // Find the document record
      const document = await this.prismaService.generatedDocuments.findUnique({
        where: { id: documentId }
      });

      if (!document || !document.publicUrl) {
        throw new Error('Document not found or public URL is missing');
      }

      // Download the zip file from Google Cloud Storage
      const fileBuffer = await this.googleCloudService.downloadZipFromGcs(
        documentId,
        document.publicUrl
      );

      // Update download count
      await this.prismaService.generatedDocuments.update({
        where: { id: documentId },
        data: { downloadCount: { increment: 1 } }
      });

      // Extract filename from URL or use a default
      const fileName = document.publicUrl.split('/').pop() || `documents_${documentId}.zip`;

      this.logger.log(`Document ${documentId} downloaded successfully. New download count: ${document.downloadCount + 1}`);

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

  async listDocumentsWithLoans(filters?: { userId?: string; loanId?: string; }): Promise<any> {
    try {
      // Build where clause based on provided filters
      const whereClause: any = {};
      if (filters?.loanId) {
        whereClause.loanId = filters.loanId;
      }
      if (filters?.userId) {
        whereClause.loan = {
          userId: filters.userId
        };
      }

      // Retrieve documents with their loan applications
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
                  Document: true  // Mover aquí la inclusión de la relación
                }
              }
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      // Format the results
      const formattedResults = documents.map(doc => ({
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

      this.logger.log(`Retrieved ${formattedResults.length} documents with loan details`);
      return formattedResults;
    } catch (error) {
      this.logger.error('Error listing documents with loan details', error);
      throw error;
    }
  }

  /**
   * Lists documents that have never been downloaded (downloadCount = 0)
   * Optional filtering by user ID or loan ID
   * @param filters Optional filters to apply (userId, loanId)
   * @returns List of never-downloaded documents with their loan application details
   */
  async listNeverDownloadedDocuments(filters?: {
    userId?: string;
    loanId?: string;
  }): Promise<Array<{
    document: any;
    loanApplication: any;
    downloadCount: number;
    lastDownloaded?: Date;
  }>> {
    try {
      // Build where clause based on provided filters
      const whereClause: any = {
        downloadCount: 0
      };

      if (filters?.loanId) {
        whereClause.loanId = filters.loanId;
      }

      if (filters?.userId) {
        whereClause.loan = {
          userId: filters.userId
        };
      }

      // Retrieve documents with download count = 0
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
                  Document: true  // Incluye la relación dentro de select
                }
              }
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      // Format the results
      const formattedResults = documents.map(doc => ({
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
        downloadCount: 0,
        lastDownloaded: doc.updated_at
      }));

      this.logger.log(`Retrieved ${formattedResults.length} never-downloaded documents`);
      return formattedResults;
    } catch (error) {
      this.logger.error('Error listing never-downloaded documents', error);
      throw error;
    }
  }

  /**
   * Lists documents that have been downloaded at least once (downloadCount >= 1)
   * Optional filtering by user ID or loan ID
   * @param filters Optional filters to apply (userId, loanId)
   * @returns List of downloaded documents with their loan application details
   */
  async listDownloadedDocuments(filters?: {
    userId?: string;
    loanId?: string;
  }): Promise<Array<{
    document: any;
    loanApplication: any;
    downloadCount: number;
    lastDownloaded?: Date;
  }>> {
    try {
      // Build where clause based on provided filters
      const whereClause: any = {
        downloadCount: {
          gte: 1
        }
      };

      if (filters?.loanId) {
        whereClause.loanId = filters.loanId;
      }

      if (filters?.userId) {
        whereClause.loan = {
          userId: filters.userId
        };
      }

      // Retrieve documents with download count >= 1
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
                  Document: true  // Se incluye la relación Document dentro del select
                }
              }
            }
          }
        },
        orderBy: {
          updated_at: 'desc' // Sort by most recently downloaded
        }
      });

      // Format the results
      const formattedResults = documents.map(doc => ({
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

      this.logger.log(`Retrieved ${formattedResults.length} downloaded documents`);
      return formattedResults;
    } catch (error) {
      this.logger.error('Error listing downloaded documents', error);
      throw error;
    }
  }
}