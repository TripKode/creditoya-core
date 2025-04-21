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

@Controller('clients')
export class ClientController {
  private logger = new Logger(ClientController.name);
  constructor(private readonly clientService: ClientService) { }

  @Post()
  async create(@Body() createClientDto: CreateClientDto): Promise<User> {
    try {
      return await this.clientService.create(createClientDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // Acceso solo para clientes
  @UseGuards(ClientAuthGuard)
  @Get(':id')
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
  async search(@Param('query') query: string): Promise<User[]> {
    const results = await this.clientService.searchUser(query);
    if (!results) {
      throw new HttpException('Error en la búsqueda', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return results;
  }

  // El cliente solo puede actualizar su propio perfil
  @UseGuards(ClientAuthGuard)
  @Put(':id')
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

  // El cliente solo puede actualizar sus propios documentos
  @UseGuards(ClientAuthGuard)
  @Put(':userId/document')
  @UseInterceptors(FileInterceptor('file'))
  async updateDocument(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ): Promise<User> {
    try {
      this.logger.warn(file, userId, user);

      // Verificar si el usuario está actualizando sus propios documentos
      if (user.type === 'client' && user.id !== userId) {
        throw new HttpException('No autorizado', HttpStatus.FORBIDDEN);
      }

      const updatedDocument = await this.clientService.updateDocument(user.id, file);

      this.logger.warn("result update doc: ", updatedDocument);

      if (!updatedDocument) {
        throw new HttpException('Error al actualizar el documento', HttpStatus.BAD_REQUEST);
      }

      return updatedDocument;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(ClientAuthGuard)
  @Put(':userId/document/selfie')
  @UseInterceptors(FileInterceptor('file'))
  async updateSelfie(
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    try {
      // Verificar si el usuario está actualizando sus propios documentos
      if (user.type === 'client' && user.id !== userId) {
        throw new HttpException('No autorizado', HttpStatus.FORBIDDEN);
      }

      // Si no hay archivo, lanzar error
      if (!file) {
        throw new HttpException('No se ha proporcionado ninguna imagen', HttpStatus.BAD_REQUEST);
      }

      return await this.clientService.updateImageWithCC(user.id, file);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // El cliente solo puede ver sus propios documentos
  @UseGuards(ClientAuthGuard)
  @Get(':userId/documents')
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
  async getAllClientsInfo(): Promise<{ id: string; email: string; names: string }[]> {
    return await this.clientService.getAllClientsInfo();
  }
}