import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientService } from './client.service';
import { User, Document } from '@prisma/client';
import { ClientAuthGuard } from '../auth/guards/client-auth.guard';
import { IntranetAuthGuard } from '../auth/guards/intranet-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RejectReasonDto, UpdateDocumentDto, UpdatePasswordDto, CreateClientDto } from './dto/create-client.dto';
import { CombinedAuthGuard } from 'src/auth/guards/combined-auth.guard';
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

@ApiTags('clients')
@Controller('clients')
export class ClientController {
  private logger = new Logger(ClientController.name);
  constructor(private readonly clientService: ClientService) { }

  @Post()
  @ApiOperation({ summary: 'Crear nuevo cliente' })
  @ApiBody({ description: 'Datos del cliente a crear' })
  @ApiResponse({ status: 201, description: 'Cliente creado exitosamente' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  async create(@Body() createClientDto: User): Promise<User> {
    try {
      return await this.clientService.create(createClientDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // Acceso solo para clientes
  @UseGuards(CombinedAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Obtener perfil de cliente' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Perfil del cliente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado para ver este perfil' })
  @ApiNotFoundResponse({ description: 'Cliente no encontrado' })
  async get(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<User> {
    // Solo el propio usuario puede ver su perfil, a menos que sea un usuario de intranet
    if (user.type === 'client' && user.id !== id) {
      throw new HttpException('No autorizado', HttpStatus.FORBIDDEN);
    }

    const client = await this.clientService.get(id);
    if (!client) {
      throw new HttpException('Cliente no encontrado', HttpStatus.NOT_FOUND);
    }
    return client;
  }

  // Solo intranet puede ver todos los usuarios
  @UseGuards(IntranetAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Obtener lista paginada de todos los clientes (solo intranet)' })
  @ApiQuery({ name: 'page', required: false, description: 'Número de página', example: '1' })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Tamaño de página', example: '8' })
  @ApiQuery({ name: 'search', required: false, description: 'Término de búsqueda' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de clientes con paginación' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  async all(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '8',
    @Query('search') search?: string,
  ): Promise<{ users: User[]; totalCount: number }> {
    return await this.clientService.all(
      parseInt(page),
      parseInt(pageSize),
      search
    );
  }

  // Solo intranet puede buscar usuarios
  @UseGuards(IntranetAuthGuard)
  @Get('search/:query')
  @ApiOperation({ summary: 'Buscar clientes por término (solo intranet)' })
  @ApiParam({ name: 'query', description: 'Término de búsqueda' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Resultados de búsqueda' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  async search(@Param('query') query: string): Promise<User[]> {
    const results = await this.clientService.searchUser(query);
    if (!results) {
      throw new HttpException('Error en la búsqueda', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return results;
  }

  // El cliente solo puede actualizar su propio perfil
  @UseGuards(CombinedAuthGuard)
  @Put(':id')
  @ApiOperation({ summary: 'Actualizar perfil de cliente' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiBody({ description: 'Datos a actualizar (sin contraseña)' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Perfil actualizado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado para actualizar este perfil' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  async update(
    @Param('id') id: string,
    @Body() dataUser: Omit<User, 'password'>,
    @CurrentUser() user: any,
  ): Promise<User> {
    // Verificar si el usuario está actualizando su propio perfil
    if (user.type === 'client' && user.id !== id) {
      throw new HttpException('No autorizado', HttpStatus.FORBIDDEN);
    }

    try {
      return await this.clientService.update(id, dataUser);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // El cliente solo puede cambiar su propia contraseña
  @UseGuards(ClientAuthGuard)
  @Put(':id/password')
  @ApiOperation({ summary: 'Cambiar contraseña del cliente' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiBody({ type: UpdatePasswordDto, description: 'Nueva contraseña' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Contraseña actualizada exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado para cambiar esta contraseña' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  async updatePassword(
    @Param('id') id: string,
    @Body() updatePasswordDto: UpdatePasswordDto,
    @CurrentUser() user: any,
  ): Promise<User> {
    // Verificar si el usuario está cambiando su propia contraseña
    if (user.type === 'client' && user.id !== id) {
      throw new HttpException('No autorizado', HttpStatus.FORBIDDEN);
    }

    try {
      return await this.clientService.updatePassword(id, updatePasswordDto.password);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // Solo administradores de intranet pueden eliminar usuarios
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar cliente (solo administradores)' })
  @ApiParam({ name: 'id', description: 'ID del cliente a eliminar' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Cliente eliminado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos de administrador' })
  @ApiBadRequestResponse({ description: 'Error al eliminar cliente' })
  async delete(@Param('id') id: string): Promise<User> {
    try {
      return await this.clientService.delete(id);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // El cliente solo puede ver sus propios documentos
  @UseGuards(ClientAuthGuard)
  @Get(':userId/has-document-data')
  @ApiOperation({ summary: 'Verificar si el cliente tiene datos de documento' })
  @ApiParam({ name: 'userId', description: 'ID del usuario' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Estado de datos de documento' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
  async hasDocumentData(
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ): Promise<{ hasData: boolean }> {
    // Verificar si el usuario está accediendo a sus propios documentos
    if (user.type === 'client' && user.id !== userId) {
      throw new HttpException('No autorizado', HttpStatus.FORBIDDEN);
    }

    try {
      const hasData = await this.clientService.hasDocumentData(userId);
      return { hasData };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(ClientAuthGuard)
  @Put(':userId/avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Actualizar avatar del cliente' })
  @ApiParam({ name: 'userId', description: 'ID del usuario' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo de imagen para el avatar',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo de imagen (JPEG, JPG, PNG)'
        }
      }
    }
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Avatar actualizado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
  @ApiBadRequestResponse({ description: 'Archivo inválido o error al procesar' })
  async updateAvatar(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    // Verificar si el usuario está actualizando sus propios documentos
    if (user.type === 'client' && user.id !== userId) {
      throw new HttpException('No autorizado', HttpStatus.FORBIDDEN);
    }

    const updateAvatar = this.clientService.updateAvatar(user.id, file);

    // this.logger.warn("result update avatar: ", updateAvatar);

    if (!updateAvatar) {
      throw new HttpException('Error al actualizar el avatar', HttpStatus.BAD_REQUEST);
    }

    return updateAvatar;
  }

  @UseGuards(ClientAuthGuard)
  @Put(':userId/document')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB límite
      },
      fileFilter: (req, file, callback) => {
        const validMimeTypes = [
          'application/pdf',
          'image/jpeg',
          'image/jpg',
          'image/png'
        ];

        if (!validMimeTypes.includes(file.mimetype)) {
          return callback(
            new HttpException(
              'Tipo de archivo no válido. Se permiten PDF, JPEG, JPG y PNG.',
              HttpStatus.BAD_REQUEST
            ),
            false
          );
        }

        callback(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Actualizar documento del cliente' })
  @ApiParam({ name: 'userId', description: 'ID del usuario' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo de documento',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo PDF o imagen (máx. 10MB)'
        }
      }
    }
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Documento actualizado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
  @ApiBadRequestResponse({ description: 'Archivo inválido o error al procesar' })
  async updateDocument(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<User> {
    try {
      this.logger.log('Iniciando proceso de actualización de documento');
      this.logger.log('Datos recibidos:', {
        userId,
        employeedId: user.id,
        filePresente: !!file,
        fileSize: file?.size,
        fileMimetype: file?.mimetype,
        userType: user?.type,
      });

      // Verificar si el usuario está actualizando sus propios documentos
      if (user.type === 'client' && user.id !== userId) {
        this.logger.warn(`Usuario ${user.id} intentó modificar documentos de otro usuario ${userId}`);
        throw new HttpException('No autorizado', HttpStatus.FORBIDDEN);
      }

      // Validación explícita del archivo
      if (!file) {
        this.logger.error('No se recibió ningún archivo');
        throw new HttpException('No se recibió ningún archivo', HttpStatus.BAD_REQUEST);
      }

      if (!file.buffer || file.buffer.length === 0) {
        this.logger.error('El archivo está vacío o corrupto');
        throw new HttpException('El archivo está vacío o corrupto', HttpStatus.BAD_REQUEST);
      }

      const updatedDocument = await this.clientService.updateDocument(user.id, file);

      this.logger.log("Resultado de actualización de documento:", !!updatedDocument);

      if (!updatedDocument) {
        throw new HttpException('Error al actualizar el documento', HttpStatus.BAD_REQUEST);
      }

      return updatedDocument;
    } catch (error) {
      this.logger.error(`Error en updateDocument: ${error.message}`, error.stack);

      // Proporcionar mensajes de error más específicos
      if (error instanceof HttpException) {
        throw error;
      }

      if (error.message.includes('Usuario no tiene documentos registrados')) {
        throw new HttpException('El usuario no tiene documentos registrados. Por favor, contacte con soporte.', HttpStatus.BAD_REQUEST);
      }

      throw new HttpException(
        error.message || 'Error al procesar el documento',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @UseGuards(ClientAuthGuard)
  @Put(':userId/document/selfie')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB límite para selfies
      },
      fileFilter: (req, file, callback) => {
        const validMimeTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png'
        ];

        if (!validMimeTypes.includes(file.mimetype)) {
          return callback(
            new HttpException(
              'Tipo de archivo no válido. Solo se permiten JPEG, JPG y PNG.',
              HttpStatus.BAD_REQUEST
            ),
            false
          );
        }

        callback(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Actualizar selfie del cliente' })
  @ApiParam({ name: 'userId', description: 'ID del usuario' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Imagen de selfie',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Imagen de selfie (JPEG, JPG, PNG - máx. 5MB)'
        }
      }
    }
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Selfie actualizada exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
  @ApiBadRequestResponse({ description: 'Imagen inválida o error al procesar' })
  async updateSelfie(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    try {
      this.logger.log('Iniciando proceso de actualización de selfie');
      this.logger.log('Datos recibidos:', {
        userId,
        filePresente: !!file,
        fileSize: file?.size,
        fileMimetype: file?.mimetype,
        userType: user?.type,
        employeedId: user?.id
      });

      // Verificar si el usuario está actualizando sus propios documentos
      if (user.type === 'client' && user.id !== userId) {
        this.logger.warn(`Usuario ${user.id} intentó modificar selfie de otro usuario ${userId}`);
        throw new HttpException('No autorizado', HttpStatus.FORBIDDEN);
      }

      // Validación explícita del archivo
      if (!file) {
        this.logger.error('No se recibió ninguna imagen');
        throw new HttpException('No se ha proporcionado ninguna imagen', HttpStatus.BAD_REQUEST);
      }

      if (!file.buffer || file.buffer.length === 0) {
        this.logger.error('La imagen está vacía o corrupta');
        throw new HttpException('La imagen está vacía o corrupta', HttpStatus.BAD_REQUEST);
      }

      // Verificar que el formato de imagen sea adecuado
      try {
        // Si hay alguna validación adicional de imagen, podría hacerse aquí
        this.logger.log('Imagen válida, procediendo a actualizar selfie');
      } catch (imgError) {
        this.logger.error('Error validando imagen:', imgError);
        throw new HttpException('El formato de imagen no es válido', HttpStatus.BAD_REQUEST);
      }

      const updatedDocument = await this.clientService.updateImageWithCC(user.id, file);

      this.logger.log("Resultado de actualización de selfie:", !!updatedDocument);

      if (!updatedDocument) {
        throw new HttpException('Error al actualizar la imagen', HttpStatus.BAD_REQUEST);
      }

      return updatedDocument;
    } catch (error) {
      this.logger.error(`Error en updateSelfie: ${error.message}`, error.stack);

      // Proporcionar mensajes de error más específicos
      if (error instanceof HttpException) {
        throw error;
      }

      if (error.message.includes('No se encontró documento')) {
        throw new HttpException('No se encontró información de documento para este usuario. Por favor, complete el registro primero.', HttpStatus.BAD_REQUEST);
      }

      if (error.message.includes('Error al subir imagen')) {
        throw new HttpException('Error al procesar la imagen. Por favor, intente con otra foto.', HttpStatus.BAD_REQUEST);
      }

      throw new HttpException(
        error.message || 'Error al procesar la imagen',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // El cliente solo puede ver sus propios documentos
  @UseGuards(ClientAuthGuard)
  @Get(':userId/documents')
  @ApiOperation({ summary: 'Listar documentos del cliente' })
  @ApiParam({ name: 'userId', description: 'ID del usuario' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de documentos' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
  async listDocuments(
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ): Promise<Document[]> {
    // Verificar si el usuario está accediendo a sus propios documentos
    if (user.type === 'client' && user.id !== userId) {
      throw new HttpException('No autorizado', HttpStatus.FORBIDDEN);
    }

    try {
      return await this.clientService.listDocuments(userId);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // El cliente solo puede ver sus propios documentos
  @UseGuards(ClientAuthGuard)
  @Get(':userId/document')
  @ApiOperation({ summary: 'Obtener documento del cliente' })
  @ApiParam({ name: 'userId', description: 'ID del usuario' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Documento encontrado' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No autorizado' })
  @ApiNotFoundResponse({ description: 'Documento no encontrado' })
  async getDocumentByUserId(
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ): Promise<Document> {
    // Verificar si el usuario está accediendo a sus propios documentos
    if (user.type === 'client' && user.id !== userId) {
      throw new HttpException('No autorizado', HttpStatus.FORBIDDEN);
    }

    const document = await this.clientService.getDocumentByUserId(userId);
    if (!document) {
      throw new HttpException('Documento no encontrado', HttpStatus.NOT_FOUND);
    }
    return document;
  }

  // Solo empleados o administradores de intranet pueden rechazar solicitudes
  @UseGuards(IntranetAuthGuard, RolesGuard)
  @Roles('admin', 'employee')
  @Put('loan-application/:id/reject')
  @ApiOperation({ summary: 'Rechazar solicitud de préstamo (solo empleados/admin)' })
  @ApiParam({ name: 'id', description: 'ID de la solicitud de préstamo' })
  @ApiBody({ type: RejectReasonDto, description: 'Razón del rechazo' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Solicitud rechazada exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiForbiddenResponse({ description: 'No tiene permisos suficientes' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  async changeReject(
    @Param('id') id: string,
    @Body() rejectDto: RejectReasonDto,
  ) {
    try {
      return await this.clientService.changeReject(id, rejectDto.reason);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // Solo intranet puede ver información de todos los clientes
  @UseGuards(IntranetAuthGuard)
  @Get('all/info')
  @ApiOperation({ summary: 'Obtener información básica de todos los clientes (solo intranet)' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de información básica de clientes' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  async getAllClientsInfo(): Promise<{ id: string; email: string; names: string }[]> {
    return await this.clientService.getAllClientsInfo();
  }
}