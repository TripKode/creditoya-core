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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse
} from '@nestjs/swagger';

@ApiTags('loans')
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
  @ApiOperation({ summary: 'Pre-crear solicitud de préstamo con documentos' })
  @ApiParam({ name: 'userId', description: 'ID del usuario cliente' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Datos del préstamo y documentos',
    schema: {
      type: 'object',
      properties: {
        signature: { type: 'string', description: 'Firma digital' },
        entity: { type: 'string', description: 'Entidad financiera' },
        phone: { type: 'string', description: 'Teléfono de contacto' },
        city: { type: 'string', description: 'Ciudad (opcional)' },
        residence_address: { type: 'string', description: 'Dirección de residencia (opcional)' },
        bankNumberAccount: { type: 'string', description: 'Número de cuenta bancaria' },
        cantity: { type: 'string', description: 'Cantidad solicitada' },
        terms_and_conditions: { type: 'boolean', description: 'Aceptación de términos y condiciones' },
        isValorAgregado: { type: 'boolean', description: 'Valor agregado (opcional)' },
        labor_card: { type: 'string', format: 'binary', description: 'Carta laboral' },
        fisrt_flyer: { type: 'string', format: 'binary', description: 'Primer volante de pago' },
        second_flyer: { type: 'string', format: 'binary', description: 'Segundo volante de pago' },
        third_flyer: { type: 'string', format: 'binary', description: 'Tercer volante de pago' }
      }
    }
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Solicitud pre-creada exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
  @ApiBadRequestResponse({ description: 'Datos inválidos o archivos faltantes' })
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
  @ApiOperation({ summary: 'Verificar pre-creación de préstamo con token' })
  @ApiParam({ name: 'userId', description: 'ID del usuario cliente' })
  @ApiParam({ name: 'pre_id', description: 'ID de pre-creación' })
  @ApiBody({ schema: { type: 'object', properties: { token: { type: 'string', description: 'Token de verificación' } } } })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Préstamo verificado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
  @ApiBadRequestResponse({ description: 'Token inválido o datos incorrectos' })
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
  @ApiOperation({ summary: 'Desembolsar préstamo (solo intranet)' })
  @ApiParam({ name: 'loanId', description: 'ID del préstamo a desembolsar' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Préstamo desembolsado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiBadRequestResponse({ description: 'Error en el desembolso' })
  async DisburseLoan(
    @Param('loanId', ParseUUIDPipe) loanId: string,
  ) {
    return this.loanDisburse.disburseLoan(loanId);
  }

  @UseGuards(IntranetAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Obtener lista paginada de todos los préstamos (solo intranet)' })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página', example: '1' })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Tamaño de página', example: '5' })
  @ApiQuery({ name: 'searchTerm', required: false, description: 'Término de búsqueda' })
  @ApiQuery({ name: 'orderBy', required: false, description: 'Orden ascendente o descendente', example: 'asc' })
  @ApiQuery({ name: 'filterByAmount', required: false, description: 'Filtrar por cantidad', example: 'false' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de préstamos con paginación' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiBadRequestResponse({ description: 'Parámetros inválidos' })
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
  @ApiOperation({ summary: 'Obtener préstamos pendientes (solo intranet)' })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página', example: '1' })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Tamaño de página', example: '5' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de préstamos pendientes' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  async getPendingLoans(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(5), ParseIntPipe) pageSize: number,
  ) {
    return this.loanQuery.getPendingLoans(page, pageSize);
  }

  // Solo personal de intranet puede ver préstamos aprobados
  @UseGuards(IntranetAuthGuard)
  @Get('approved')
  @ApiOperation({ summary: 'Obtener préstamos aprobados (solo intranet)' })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página', example: '1' })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Tamaño de página', example: '5' })
  @ApiQuery({ name: 'search', required: false, description: 'Término de búsqueda' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de préstamos aprobados' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
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
  @ApiOperation({ summary: 'Obtener préstamos desembolsados (solo intranet)' })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página', example: '1' })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Tamaño de página', example: '10' })
  @ApiQuery({ name: 'search', required: false, description: 'Término de búsqueda' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de préstamos desembolsados' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
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
  @ApiOperation({ summary: 'Obtener préstamos diferidos (solo intranet)' })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página', example: '1' })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Tamaño de página', example: '5' })
  @ApiQuery({ name: 'search', required: false, description: 'Término de búsqueda' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de préstamos diferidos' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
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
  @ApiOperation({ summary: 'Obtener préstamos con nueva cantidad definida (solo intranet)' })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página', example: '1' })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Tamaño de página', example: '5' })
  @ApiQuery({ name: 'search', required: false, description: 'Término de búsqueda' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de préstamos con nueva cantidad' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  async getLoansWithDefinedNewCantity(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(5), ParseIntPipe) pageSize: number,
    @Query('search') searchQuery?: string,
  ) {
    return this.loanQuery.getLoansWithDefinedNewCantity(page, pageSize, searchQuery);
  }

  @UseGuards(CombinedAuthGuard)
  @Get(':user_id/:loan_id/info')
  @ApiOperation({ summary: 'Obtener información detallada de un préstamo' })
  @ApiParam({ name: 'user_id', description: 'ID del usuario' })
  @ApiParam({ name: 'loan_id', description: 'ID del préstamo' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Información del préstamo' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado para ver este préstamo' })
  @ApiNotFoundResponse({ description: 'Préstamo no encontrado' })
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
  @ApiOperation({ summary: 'Obtener el último préstamo del cliente' })
  @ApiParam({ name: 'user_id', description: 'ID del usuario cliente' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Último préstamo del cliente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
  @ApiNotFoundResponse({ description: 'No se encontró préstamo' })
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
  @ApiOperation({ summary: 'Obtener todos los préstamos de un cliente' })
  @ApiParam({ name: 'client_id', description: 'ID del cliente' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de préstamos del cliente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
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
  @ApiOperation({ summary: 'Obtener préstamos por usuario' })
  @ApiParam({ name: 'userId', description: 'ID del usuario' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de préstamos del usuario' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
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
  @ApiOperation({ summary: 'Actualizar préstamo (solo admin/employee)' })
  @ApiParam({ name: 'id', description: 'ID del préstamo' })
  @ApiBody({ type: UpdateLoanApplicationDto, description: 'Datos a actualizar' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Préstamo actualizado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos suficientes' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
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
  @ApiOperation({ summary: 'Cambiar estado del préstamo (solo admin/employee)' })
  @ApiParam({ name: 'id', description: 'ID del préstamo' })
  @ApiBody({ type: ChangeLoanStatusDto, description: 'Nuevo estado del préstamo' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Estado del préstamo cambiado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos suficientes' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
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
  @ApiOperation({ summary: 'Rechazar préstamo (solo admin/employee)' })
  @ApiParam({ name: 'id', description: 'ID del préstamo' })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string', description: 'Razón del rechazo' } } } })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Préstamo rechazado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos suficientes' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
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
  @ApiOperation({ summary: 'Asignar empleado a préstamo (solo admin/employee)' })
  @ApiParam({ name: 'id', description: 'ID del préstamo' })
  @ApiParam({ name: 'employeeId', description: 'ID del empleado a asignar' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Empleado asignado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos suficientes' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
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
  @ApiOperation({ summary: 'Responder a oferta de nueva cantidad' })
  @ApiParam({ name: 'id', description: 'ID del préstamo' })
  @ApiBody({ schema: { type: 'object', properties: { accept: { type: 'boolean', description: 'Aceptar o rechazar la oferta' } } } })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Respuesta registrada exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
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
  @ApiOperation({ summary: 'Eliminar préstamo (solo admin)' })
  @ApiParam({ name: 'id', description: 'ID del préstamo a eliminar' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Préstamo eliminado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos de administrador' })
  @ApiBadRequestResponse({ description: 'Error al eliminar préstamo' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.loanManagment.delete(id);
  }

  @UseGuards(ClientAuthGuard)
  @Post(':loan_id/upload-rejected-document/:document_type')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Subir documento rechazado para reemplazo' })
  @ApiParam({ name: 'loan_id', description: 'ID del préstamo' })
  @ApiParam({ name: 'document_type', description: 'Tipo de documento', enum: ['fisrt_flyer', 'second_flyer', 'third_flyer', 'labor_card'] })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo de documento',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo PDF o imagen'
        }
      }
    }
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Documento subido exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
  @ApiBadRequestResponse({ description: 'Archivo inválido o tipo de documento incorrecto' })
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