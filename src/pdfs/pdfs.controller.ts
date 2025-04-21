import { Controller, Get, Post, Body, Param, Query, UseGuards, Res, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PdfsService } from './pdfs.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { StatusLoan } from '@prisma/client';
import { DocumentParams } from './dto/create-pdf.dto';
import { Response } from 'express';
import { IntranetAuthGuard } from 'src/auth/guards/intranet-auth.guard';
import { ClientAuthGuard } from 'src/auth/guards/client-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Controller('pdfs')
export class PdfsController {
  constructor(
    private readonly pdfsService: PdfsService,
    private readonly prismaService: PrismaService
  ) { }

  // Solo permitir intranet y verificar que el préstamo exista
  @UseGuards(IntranetAuthGuard)
  @Get('loan-documents/:loanId')
  async getLoanDocuments(
    @Param('loanId') loanId: string,
    @CurrentUser() user: any
  ) {
    // Verificar que el préstamo existe
    const loan = await this.prismaService.loanApplication.findUnique({
      where: { id: loanId }
    });

    if (!loan) {
      throw new NotFoundException('Préstamo no encontrado');
    }

    return this.pdfsService.listDocsGenerates(loanId);
  }

  // Solo para personal de intranet
  @UseGuards(IntranetAuthGuard)
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

  // Solo para administradores y empleados
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Get('pending-documents')
  async getPendingDocuments() {
    return this.pdfsService.findnewDocs();
  }

  // Solo para administradores y empleados
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Post('generate')
  async generateDocuments(
    @Body() body: {
      documentsParams: Array<any>,
      userId: string,
      loanId: string
    }
  ) {
    // Verificar que el préstamo existe
    const loan = await this.prismaService.loanApplication.findUnique({
      where: { id: body.loanId }
    });

    if (!loan) {
      throw new NotFoundException('Préstamo no encontrado');
    }

    // Verificar que el usuario existe
    const user = await this.prismaService.user.findUnique({
      where: { id: body.userId }
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.pdfsService.generateAndUploadPdfs(
      body.documentsParams,
      body.userId,
      body.loanId
    );
  }

  // Solo para administradores y empleados
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
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

  // Solo para administradores y empleados
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Post('generate/instruction-letter')
  async generateInstructionLetter(
    @Body() params: { signature: string; numberDocument: string; name: string }
  ) {
    return this.pdfsService.generateInstructionLetterPdf(params);
  }

  // Solo para administradores y empleados
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Post('generate/salary-payment')
  async generateSalaryPayment(
    @Body() params: { signature: string; numberDocument: string; name: string }
  ) {
    return this.pdfsService.generateSalaryPaymentAuthorizationPdf(params);
  }

  // Solo para administradores y empleados
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Post('generate/promissory-note')
  async generatePromissoryNote(
    @Body() params: { signature: string; numberDocument: string; name: string }
  ) {
    return this.pdfsService.generatePromissoryNotePdf(params);
  }

  // Solo para administradores y empleados
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Post('generate/multiple')
  async generateMultiple(
    @Body() documentsParams: Array<DocumentParams>
  ) {
    return this.pdfsService.generateMultiplePdfs(documentsParams);
  }

  // Solo para administradores y empleados
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Post('generate-pending')
  async processPendingDocuments() {
    return this.pdfsService.generatePendingDocuments();
  }

  // Accesible tanto para clientes como para intranet con validaciones
  @UseGuards(ClientAuthGuard)
  @Get('document/:documentId')
  async downloadDocument(
    @Param('documentId') documentId: string,
    @Res() res: Response,
    @CurrentUser() user: any
  ) {
    // Verificar que el documento existe
    const document = await this.prismaService.generatedDocuments.findUnique({
      where: { id: documentId },
      include: { loan: true }
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    // Si es un cliente, verificar que el documento pertenece a un préstamo de este cliente
    if (user.type === 'client') {
      if (document.loan.userId !== user.id) {
        throw new ForbiddenException('No tiene permiso para descargar este documento');
      }
    }

    const { buffer, fileName, contentType } = await this.pdfsService.downloadDocument(documentId);

    // Registrar la descarga
    await this.prismaService.generatedDocuments.update({
      where: { id: documentId },
      data: { downloadCount: { increment: 1 } }
    });

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });

    return res.send(buffer);
  }

  // Puede ser accedido por intranet y clientes con restricciones
  @UseGuards(ClientAuthGuard)
  @Get('all-documents')
  async getAllDocuments(
    @CurrentUser() user: any,
    @Query('userId') userId?: string,
    @Query('loanId') loanId?: string,
  ) {
    // Si es un cliente, solo puede ver sus propios documentos
    if (user.type === 'client') {
      if (userId && userId !== user.id) {
        throw new ForbiddenException('Solo puede ver sus propios documentos');
      }

      // Forzar que solo muestre documentos del usuario autenticado
      userId = user.id;
    }

    return this.pdfsService.listDocumentsWithLoans({ userId, loanId });
  }

  // Puede ser accedido por intranet y clientes con restricciones
  @UseGuards(ClientAuthGuard)
  @Get('never-downloaded')
  async getNeverDownloadedDocuments(
    @CurrentUser() user: any,
    @Query('userId') userId?: string,
    @Query('loanId') loanId?: string
  ) {
    // Si es un cliente, solo puede ver sus propios documentos
    if (user.type === 'client') {
      if (userId && userId !== user.id) {
        throw new ForbiddenException('Solo puede ver sus propios documentos');
      }

      // Forzar que solo muestre documentos del usuario autenticado
      userId = user.id;
    }

    return this.pdfsService.listNeverDownloadedDocuments({ userId, loanId });
  }

  // Puede ser accedido por intranet y clientes con restricciones
  @UseGuards(ClientAuthGuard)
  @Get('downloaded')
  async getDownloadedDocuments(
    @CurrentUser() user: any,
    @Query('userId') userId?: string,
    @Query('loanId') loanId?: string
  ) {
    // Si es un cliente, solo puede ver sus propios documentos
    if (user.type === 'client') {
      if (userId && userId !== user.id) {
        throw new ForbiddenException('Solo puede ver sus propios documentos');
      }

      // Forzar que solo muestre documentos del usuario autenticado
      userId = user.id;
    }

    return this.pdfsService.listDownloadedDocuments({ userId, loanId });
  }
}