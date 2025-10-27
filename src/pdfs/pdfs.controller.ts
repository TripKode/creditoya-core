import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PdfsService } from './pdfs.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { StatusLoan } from '@prisma/client';
import { DocumentParams } from './dto/create-pdf.dto';
import { Response } from 'express';
import { IntranetAuthGuard } from 'src/auth/guards/intranet-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { CombinedAuthGuard } from 'src/auth/guards/combined-auth.guard';
import { SkeletonPdfServices } from './services/skeleton.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse
} from '@nestjs/swagger';

@ApiTags('pdfs')
@Controller('pdfs')
export class PdfsController {
  constructor(
    private readonly pdfsService: PdfsService,
    private readonly pdfsSkeleton: SkeletonPdfServices,
    private readonly prismaService: PrismaService
  ) { }

  // Solo permitir intranet y verificar que el préstamo exista
  @UseGuards(IntranetAuthGuard)
  @Get('loan-documents/:loanId')
  @ApiOperation({ summary: 'Obtener documentos generados de un préstamo (solo intranet)' })
  @ApiParam({ name: 'loanId', description: 'ID del préstamo' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de documentos del préstamo' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiNotFoundResponse({ description: 'Préstamo no encontrado' })
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
  @ApiOperation({ summary: 'Obtener préstamos con documentos generados (solo intranet)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrar por estado del préstamo' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de préstamos con documentos' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
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
  @ApiOperation({ summary: 'Obtener documentos pendientes de generación (solo admin/employee)' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de documentos pendientes' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos suficientes' })
  async getPendingDocuments() {
    return this.pdfsService.findnewDocs();
  }

  // Solo para administradores y empleados
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Post('generate')
  @ApiOperation({ summary: 'Generar documentos PDF para un préstamo (solo admin/employee)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documentsParams: { type: 'array', description: 'Parámetros de los documentos a generar' },
        userId: { type: 'string', description: 'ID del usuario' },
        loanId: { type: 'string', description: 'ID del préstamo' }
      }
    }
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Documentos generados exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos suficientes' })
  @ApiNotFoundResponse({ description: 'Usuario o préstamo no encontrado' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
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
  @ApiOperation({ summary: 'Generar PDF "Acerca del Préstamo" (solo admin/employee)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        signature: { type: 'string', description: 'Firma digital' },
        numberDocument: { type: 'string', description: 'Número de documento' },
        autoDownload: { type: 'boolean', description: 'Descarga automática (opcional)' },
        entity: { type: 'string', description: 'Entidad financiera' },
        accountNumber: { type: 'string', description: 'Número de cuenta' }
      }
    }
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'PDF generado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos suficientes' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  async generateAboutLoan(
    @Body() params: {
      signature: string;
      numberDocument: string;
      autoDownload?: boolean,
      entity: string,
      accountNumber: string
    }
  ) {
    return this.pdfsSkeleton.generateAboutLoanPdf(params);
  }

  // Solo para administradores y empleados
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Post('generate/instruction-letter')
  @ApiOperation({ summary: 'Generar carta de instrucciones (solo admin/employee)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        signature: { type: 'string', description: 'Firma digital' },
        numberDocument: { type: 'string', description: 'Número de documento' },
        name: { type: 'string', description: 'Nombre del destinatario' }
      }
    }
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Carta generada exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos suficientes' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  async generateInstructionLetter(
    @Body() params: { signature: string; numberDocument: string; name: string }
  ) {
    return this.pdfsSkeleton.generateInstructionLetterPdf(params);
  }

  // Solo para administradores y empleados
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Post('generate/salary-payment')
  @ApiOperation({ summary: 'Generar autorización de pago de salario (solo admin/employee)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        signature: { type: 'string', description: 'Firma digital' },
        numberDocument: { type: 'string', description: 'Número de documento' },
        name: { type: 'string', description: 'Nombre del empleado' }
      }
    }
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Autorización generada exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos suficientes' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  async generateSalaryPayment(
    @Body() params: { signature: string; numberDocument: string; name: string }
  ) {
    return this.pdfsSkeleton.generateSalaryPaymentAuthorizationPdf(params);
  }

  // Solo para administradores y empleados
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Post('generate/promissory-note')
  @ApiOperation({ summary: 'Generar pagaré (solo admin/employee)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        signature: { type: 'string', description: 'Firma digital' },
        numberDocument: { type: 'string', description: 'Número de documento' },
        name: { type: 'string', description: 'Nombre del firmante' }
      }
    }
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Pagaré generado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos suficientes' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  async generatePromissoryNote(
    @Body() params: { signature: string; numberDocument: string; name: string }
  ) {
    return this.pdfsSkeleton.generatePromissoryNotePdf(params);
  }

  // Solo para administradores y empleados
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Post('generate/multiple')
  @ApiOperation({ summary: 'Generar múltiples PDFs (solo admin/employee)' })
  @ApiBody({ description: 'Array de parámetros para generar múltiples documentos' })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Documentos generados exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos suficientes' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  async generateMultiple(
    @Body() documentsParams: Array<DocumentParams>
  ) {
    return this.pdfsService.generateMultiplePdfs(documentsParams);
  }

  // Accesible tanto para clientes como para intranet con validaciones
  // @UseGuards(IntranetAuthGuard)
  @Get('document/:documentId')
  @ApiOperation({ summary: 'Descargar documento PDF' })
  @ApiParam({ name: 'documentId', description: 'ID del documento a descargar' })
  @ApiResponse({ status: 200, description: 'Documento descargado exitosamente', content: { 'application/pdf': {} } })
  @ApiNotFoundResponse({ description: 'Documento no encontrado' })
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

    // // Si es un cliente, verificar que el documento pertenece a un préstamo de este cliente
    // if (user.type === 'client' || user.type === 'intranet') {
    //   if (document.loan.userId !== user.id) {
    //     throw new ForbiddenException('No tiene permiso para descargar este documento');
    //   }
    // }

    const { buffer, fileName, contentType } = await this.pdfsService.downloadDocument(documentId);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });

    return res.send(buffer);
  }

  // Puede ser accedido por intranet y clientes con restricciones
  @UseGuards(CombinedAuthGuard)
  @Get('all-documents')
  @ApiOperation({ summary: 'Obtener todos los documentos con información de préstamos' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filtrar por ID de usuario' })
  @ApiQuery({ name: 'loanId', required: false, description: 'Filtrar por ID de préstamo' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de documentos con información de préstamos' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  async getAllDocuments(
    @CurrentUser() user: any,
    @Query('userId') userId?: string,
    @Query('loanId') loanId?: string,
  ) {
    // // Si es un cliente, solo puede ver sus propios documentos
    // if (user.type === 'client') {
    //   if (userId && userId !== user.id) {
    //     throw new ForbiddenException('Solo puede ver sus propios documentos');
    //   }

    //   // Forzar que solo muestre documentos del usuario autenticado
    //   userId = user.id;
    // }

    return this.pdfsService.listDocumentsWithLoans({ userId, loanId });
  }

  // Puede ser accedido por intranet y clientes con restricciones
  @UseGuards(CombinedAuthGuard)
  @Get('never-downloaded')
  @ApiOperation({ summary: 'Obtener documentos nunca descargados' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filtrar por ID de usuario' })
  @ApiQuery({ name: 'loanId', required: false, description: 'Filtrar por ID de préstamo' })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página', example: '1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Límite de resultados', example: '10' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de documentos nunca descargados' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos' })
  async getNeverDownloadedDocuments(
    @CurrentUser() user: any,
    @Query('userId') userId?: string,
    @Query('loanId') loanId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10'
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;

    // Validar límites
    if (limitNumber > 100) {
      throw new Error('Limit cannot exceed 100');
    }

    return this.pdfsService.listNeverDownloadedDocuments(
      { userId, loanId },
      pageNumber,
      limitNumber
    );
  }

  // Puede ser accedido por intranet y clientes con restricciones
  @UseGuards(CombinedAuthGuard)
  @Get('downloaded')
  @ApiOperation({ summary: 'Obtener documentos descargados' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filtrar por ID de usuario' })
  @ApiQuery({ name: 'loanId', required: false, description: 'Filtrar por ID de préstamo' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de documentos descargados' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
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