import { Controller, Get, Post, Body, Param, Query, UseGuards, Res } from '@nestjs/common';
import { PdfsService } from './pdfs.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { StatusLoan } from '@prisma/client';
import { DocumentParams } from './dto/create-pdf.dto';
import { Response } from 'express';

@Controller('pdfs')
export class PdfsController {
  constructor(
    private readonly pdfsService: PdfsService,
    private readonly prismaService: PrismaService
  ) { }

  @Get('loan-documents/:loanId')
  async getLoanDocuments(@Param('loanId') loanId: string) {
    return this.pdfsService.listDocsGenerates(loanId);
  }

  @Get('loans-with-documents')
  async getLoansWithDocuments(@Query('status') status?: string) {
    try {
      // Get all loan applications with generated documents
      const loansWithDocs = await this.prismaService.loanApplication.findMany({
        where: {
          GeneratedDocuments: {
            some: {}  // Has at least one document
          },
          status: status ? status as StatusLoan : undefined  // Cast to StatusLoan enum
        },
        include: {
          user: {
            select: {
              names: true,
              firstLastName: true,
              secondLastName: true,
              email: true,
              phone: true,
              avatar: true
            }
          },
          GeneratedDocuments: {
            orderBy: {
              created_at: 'desc'
            }
          }
        },
        orderBy: {
          updated_at: 'desc'
        }
      });

      return loansWithDocs;
    } catch (error) {
      throw error;
    }
  }

  @Get('pending-documents')
  async getPendingDocuments() {
    return this.pdfsService.findnewDocs();
  }

  @Post('generate')
  async generateDocuments(@Body() body: {
    documentsParams: Array<any>,
    userId: string,
    loanId: string
  }) {
    return this.pdfsService.generateAndUploadPdfs(
      body.documentsParams,
      body.userId,
      body.loanId
    );
  }

  @Post('generate/about-loan')
  async generateAboutLoan(
    @Body() params: {
      signature: string;
      numberDocument: string;
      autoDownload?: boolean,
      entity: string,
      accountNumber: string
    }
  ) {
    return this.pdfsService.generateAboutLoanPdf(params);
  }

  @Post('generate/instruction-letter')
  async generateInstructionLetter(
    @Body() params: { signature: string; numberDocument: string; name: string }
  ) {
    return this.pdfsService.generateInstructionLetterPdf(params);
  }

  @Post('generate/salary-payment')
  async generateSalaryPayment(
    @Body() params: { signature: string; numberDocument: string; name: string }
  ) {
    return this.pdfsService.generateSalaryPaymentAuthorizationPdf(params);
  }

  @Post('generate/promissory-note')
  async generatePromissoryNote(
    @Body() params: { signature: string; numberDocument: string; name: string }
  ) {
    return this.pdfsService.generatePromissoryNotePdf(params);
  }

  @Post('generate/multiple')
  async generateMultiple(
    @Body() documentsParams: Array<DocumentParams>
  ) {
    return this.pdfsService.generateMultiplePdfs(documentsParams);
  }

  @Post('generate-pending')
  async processPendingDocuments() {
    return this.pdfsService.generatePendingDocuments();
  }

  @Get('document/:documentId')
  async downloadDocument(
    @Param('documentId') documentId: string,
    @Res() res: Response
  ) {
    const { buffer, fileName, contentType } = await this.pdfsService.downloadDocument(documentId);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });

    return res.send(buffer);
  }

  @Get('all-documents')
  async getAllDocuments(
    @Query('userId') userId?: string,
    @Query('loanId') loanId?: string
  ) {
    return this.pdfsService.listDocumentsWithLoans({ userId, loanId });
  }

  @Get('never-downloaded')
  async getNeverDownloadedDocuments(
    @Query('userId') userId?: string,
    @Query('loanId') loanId?: string
  ) {
    return this.pdfsService.listNeverDownloadedDocuments({ userId, loanId });
  }

  @Get('downloaded')
  async getDownloadedDocuments(
    @Query('userId') userId?: string,
    @Query('loanId') loanId?: string
  ) {
    return this.pdfsService.listDownloadedDocuments({ userId, loanId });
  }
}