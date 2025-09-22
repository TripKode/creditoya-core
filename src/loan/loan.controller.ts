import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  ParseBoolPipe,
  BadRequestException,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  HttpException,
  HttpStatus,
  UploadedFiles,
  Logger,
  ForbiddenException,
  NotFoundException,
  UploadedFile,
  Put,
} from '@nestjs/common';
import { LoanService } from './loan.service';
import { UpdateLoanApplicationDto } from './dto/update-loan.dto';
import { ChangeLoanStatusDto } from './dto/change-loan-status.dto';
import { ClientAuthGuard } from '../auth/guards/client-auth.guard';
import { IntranetAuthGuard } from '../auth/guards/intranet-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { CombinedAuthGuard } from 'src/auth/guards/combined-auth.guard';
import { LoanDisbursementService } from './services/disbursed.service';
import { QueryService } from './services/query.service';
import { LoanManagementService } from './services/loan-managment.service';
import { StatusService } from './services/status.service';
import { LoanDocumentService } from './services/document.service';

@Controller('loans')
export class LoanController {
  private logger = new Logger(LoanController.name);

  constructor(
    private readonly loan: LoanService,
    private readonly loanDisburse: LoanDisbursementService,
    private readonly loanQuery: QueryService,
    private readonly loanManagment: LoanManagementService,
    private readonly loanStatus: StatusService,
    private readonly loanDocument: LoanDocumentService
  ) { }

  @UseGuards(ClientAuthGuard)
  @Post(":userId")
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'labor_card', maxCount: 1 },
    { name: 'fisrt_flyer', maxCount: 1 },
    { name: 'second_flyer', maxCount: 1 },
    { name: 'third_flyer', maxCount: 1 }
  ])
  )
  async PreCreateLoan(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: {
      signature: string,
      entity: string,
      phone: string,
      city?: string,
      residence_address?: string,
      bankNumberAccount: string,
      cantity: string,
      terms_and_conditions: boolean | string,
      isValorAgregado?: boolean
    },
    @UploadedFiles() files: {
      labor_card?: Express.Multer.File[],
      fisrt_flyer?: Express.Multer.File[],
      second_flyer?: Express.Multer.File[],
      third_flyer?: Express.Multer.File[]
    },
    @CurrentUser() user: any
  ) {
    // Asegurarse que el userId en el DTO coincide con el usuario autenticado
    if (user.type === 'client' && user.id !== userId) {
      throw new HttpException('No autorizado', HttpStatus.FORBIDDEN);
    }

    // Log específico para city y residence_address
    console.log('🏠 [LOAN_CONTROLLER] Campos de ubicación recibidos:', {
      city: {
        original: body.city,
        type: typeof body.city,
        isEmpty: body.city === '',
        isUndefined: body.city === undefined,
        isNull: body.city === null
      },
      residence_address: {
        original: body.residence_address,
        type: typeof body.residence_address,
        isEmpty: body.residence_address === '',
        isUndefined: body.residence_address === undefined,
        isNull: body.residence_address === null
      }
    });

    // Convert undefined to null to match the DTO expectations
    const processedData = {
      fisrt_flyer: files.fisrt_flyer?.[0] || null,  // Changed to match DTO
      second_flyer: files.second_flyer?.[0] || null,
      third_flyer: files.third_flyer?.[0] || null,
      labor_card: files.labor_card?.[0] || null,
      signature: body.signature,
      userId,
      phone: body.phone,
      // You may also need to include these other fields from the DTO
      entity: body.entity, // This should come from request body
      city: body.city || undefined,
      residence_address: body.residence_address || undefined,
      bankNumberAccount: body.bankNumberAccount, // This should come from request body
      cantity: body.cantity, // This should come from request body
      terms_and_conditions: body.terms_and_conditions === 'true' || body.terms_and_conditions === true, // Ensure boolean type
      isValorAgregado: body.isValorAgregado || undefined, // Optional field
    };

    console.log('🏠 [LOAN_CONTROLLER] Datos procesados para envío al servicio:', {
      city: processedData.city,
      residence_address: processedData.residence_address
    });

    return this.loan.preCreate(processedData);
  }

  @UseGuards(ClientAuthGuard)
  @Post(":userId/:pre_id")
  async VerifyPreCreateLoan(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('pre_id', ParseUUIDPipe) preId: string,
    @Body('token') token: string,
    @CurrentUser() user: any
  ) {
    // Asegurarse que el preId en el DTO coincide con el usuario autenticado
    if (user.type === 'client' && user.id !== userId) {
      throw new HttpException('No autorizado', HttpStatus.FORBIDDEN);
    }

    return this.loan.verifyPreLoan(token, preId);
  }

  @UseGuards(IntranetAuthGuard)
  @Put(":loanId/disburse")
  async DisburseLoan(
    @Param('loanId', ParseUUIDPipe) loanId: string,
  ) {
    return this.loanDisburse.disburseLoan(loanId);
  }

  @UseGuards(IntranetAuthGuard)
  @Get()
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(5), ParseIntPipe) pageSize: number,
    @Query('searchTerm') searchTerm?: string,
    @Query('orderBy', new DefaultValuePipe('asc')) orderBy?: 'asc' | 'desc',
    @Query('filterByAmount', new DefaultValuePipe(false), ParseBoolPipe) filterByAmount?: boolean,
  ) {
    if (orderBy !== 'asc' && orderBy !== 'desc') {
      throw new BadRequestException('orderBy debe ser "asc" o "desc"');
    }

    return this.loanQuery.getAll(page, pageSize, searchTerm, orderBy, filterByAmount);
  }

  // Solo personal de intranet puede ver préstamos pendientes
  @UseGuards(IntranetAuthGuard)
  @Get('pending')
  async getPendingLoans(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(5), ParseIntPipe) pageSize: number,
  ) {
    return this.loanQuery.getPendingLoans(page, pageSize);
  }

  // Solo personal de intranet puede ver préstamos aprobados
  @UseGuards(IntranetAuthGuard)
  @Get('approved')
  async getApprovedLoans(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(5), ParseIntPipe) pageSize: number,
    @CurrentUser() user: any,
    @Query('search') searchQuery?: string,
  ) {
    console.log(user)
    return this.loanQuery.getApprovedLoans(page, pageSize, searchQuery);
  }

  @UseGuards(IntranetAuthGuard)
  @Get('disbursed')
  async getDisbursedLoans(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '10',
    @Query('search') search?: string,
  ) {
    const pageNumber = parseInt(page, 10);
    const pageSizeNumber = parseInt(pageSize, 10);
    const searchQuery = search?.trim() || undefined;

    try {
      const { data, total } = await this.loanQuery.pendingLoanDisbursement(
        pageNumber,
        pageSizeNumber,
        searchQuery
      );

      return {
        success: true,
        data,
        total,
        page: pageNumber,
        pageSize: pageSizeNumber,
        totalPages: Math.ceil(total / pageSizeNumber),
        status: 'success'
      };
    } catch (error) {
      this.logger.error('Error getting disbursed loans:', error);

      return {
        success: false,
        data: [],
        total: 0,
        page: pageNumber,
        pageSize: pageSizeNumber,
        totalPages: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }


  // Solo personal de intranet puede ver préstamos diferidos
  @UseGuards(IntranetAuthGuard)
  @Get('deferred')
  async getDeferredLoans(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(5), ParseIntPipe) pageSize: number,
    @Query('search') searchQuery?: string,
  ) {
    return this.loanQuery.getDeferredLoans(page, pageSize, searchQuery);
  }

  // Solo personal de intranet puede ver préstamos con nueva cantidad definida
  @UseGuards(IntranetAuthGuard)
  @Get('new-cantity')
  async getLoansWithDefinedNewCantity(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(5), ParseIntPipe) pageSize: number,
    @Query('search') searchQuery?: string,
  ) {
    return this.loanQuery.getLoansWithDefinedNewCantity(page, pageSize, searchQuery);
  }

  @UseGuards(CombinedAuthGuard)
  @Get(':user_id/:loan_id/info')
  async findOne(
    @Param('user_id', ParseUUIDPipe) userId: string,
    @Param('loan_id', ParseUUIDPipe) loanId: string,
    @CurrentUser() user: any
  ) {
    // Validar permisos según el tipo de usuario
    if (user.type === 'client') {
      // Los clientes solo pueden ver sus propios préstamos
      if (userId !== user.id) {
        throw new ForbiddenException('No tiene autorización para ver préstamos de otros usuarios');
      }
    } else if (user.type === 'intranet') {
      // Los usuarios de intranet pueden ver cualquier préstamo
      // No se necesita validación adicional
    } else {
      // Si no es cliente ni intranet, no debería tener acceso
      throw new ForbiddenException('Tipo de usuario no autorizado');
    }

    try {
      console.log(loanId, userId);
      const loan = await this.loanManagment.get(loanId, userId);
      this.logger.log(`Préstamo consultado: ${loanId} para usuario: ${userId} por ${user.type}`);
      return loan;
    } catch (error) {
      this.logger.error(`Error al obtener préstamo: ${error.message}`, error.stack);
      throw new NotFoundException('El préstamo solicitado no existe o no está disponible');
    }
  }

  @UseGuards(ClientAuthGuard)
  @Get(":user_id/latest")
  async latestLoan(
    @Param('user_id', ParseUUIDPipe) userId: string,
    @CurrentUser() user: any,
  ) {
    if (user.type === 'client' && userId !== user.id) {
      throw new BadRequestException('No autorizado para ver este préstamo');
    }
    const loan = await this.loanQuery.getLatestLoanByUserId(userId);
    this.logger.log(loan);
    return loan;
  }

  @UseGuards(ClientAuthGuard)
  @Get('client/:client_id')
  async LoansByClient(
    @Param('client_id') clientId: string,
    @CurrentUser() user: any
  ) {
    const loans = await this.loanQuery.getAllLoansByUserId(clientId);

    // Si es un cliente, solo puede ver sus propios préstamos
    if (user.type === 'client' && loans.data.some(loan => loan.userId !== user.id)) {
      throw new BadRequestException('No autorizado para ver estos préstamos');
    }

    return loans;
  }

  // Clientes pueden ver sus propios préstamos
  @UseGuards(ClientAuthGuard)
  @Get('user/:userId')
  async findByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: any
  ) {
    // Si es un cliente, solo puede ver sus propios préstamos
    if (user.type === 'client' && userId !== user.id) {
      throw new BadRequestException('No autorizado para ver préstamos de otros usuarios');
    }

    return this.loanManagment.getAllByUserId(userId);
  }

  // Solo personal de intranet puede actualizar préstamos
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateLoanDto: UpdateLoanApplicationDto,
  ) {
    return this.loanManagment.update(id, updateLoanDto);
  }

  // Solo personal de intranet puede cambiar el estado de préstamos
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Patch(':id/status')
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changeStatusDto: ChangeLoanStatusDto,
  ) {
    return this.loanStatus.changeStatus(id, changeStatusDto);
  }

  // Solo personal de intranet puede rechazar préstamos
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Patch(':id/reject')
  async changeReject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
  ) {
    return this.loanStatus.changeReject(id, reason);
  }

  // Solo personal de intranet puede asignar empleados a préstamos
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Patch(':id/employee/:employeeId')
  async fillEmployeeId(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: any
  ) {
    // Si es un empleado, solo puede asignarse a sí mismo
    if (user.rol === 'employee' && employeeId !== user.id) {
      throw new BadRequestException('No autorizado para asignar a otros empleados');
    }

    return this.loanStatus.fillEmployeeId(id, employeeId);
  }

  // Los clientes pueden responder a ofertas de nueva cantidad
  @UseGuards(ClientAuthGuard)
  @Patch(':id/respond-cantity')
  async respondToNewCantity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('accept', ParseBoolPipe) accept: boolean,
    @CurrentUser() user: any
  ) {
    // Verificar que el préstamo pertenece al cliente
    const loan = await this.loanManagment.get(id, user.id);

    if (user.type === 'client' && loan.userId !== user.id) {
      throw new BadRequestException('No autorizado para responder a este préstamo');
    }

    return this.loanStatus.respondToNewCantity(id, accept);
  }

  // Solo administradores pueden eliminar préstamos
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.loanManagment.delete(id);
  }

  @UseGuards(ClientAuthGuard)
  @Post(':loan_id/upload-rejected-document/:document_type')
  @UseInterceptors(FileInterceptor('file'))
  async uploadRejectedDocument(
    @Param('loan_id', ParseUUIDPipe) loanId: string,
    @Param('document_type') documentType: 'fisrt_flyer' | 'second_flyer' | 'third_flyer' | 'labor_card',
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any
  ) {
    // Verificar que el documentType es válido
    if (!['fisrt_flyer', 'second_flyer', 'third_flyer', 'labor_card'].includes(documentType)) {
      throw new BadRequestException('Tipo de documento no válido');
    }

    // Verificar que hay un archivo
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    // Verificar que el préstamo pertenece al usuario autenticado
    try {
      const loan = await this.loanManagment.get(loanId, user.id);

      if (user.type === 'client' && loan.userId !== user.id) {
        throw new ForbiddenException('No autorizado para actualizar este préstamo');
      }

      // Llamar al servicio para subir el documento rechazado
      return this.loanDocument.uploadRejectedDocument(loanId, documentType, file);
    } catch (error) {
      this.logger.error(`Error al subir documento rechazado: ${error.message}`, error.stack);
      if (error instanceof NotFoundException || error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`Error al subir el documento: ${error.message}`);
    }
  }
}