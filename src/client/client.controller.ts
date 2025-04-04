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
} from '@nestjs/common';
import { ClientService, CreateClientDto, UpdateClientDto } from './client.service';
import { User, Document } from '@prisma/client';

// You might want to create these DTOs in separate files
export class SignInDto {
  email: string;
  password: string;
}

export class UpdatePasswordDto {
  password: string;
}

export class UpdateDocumentDto {
  documentSides: string;
  number: string;
}

export class RejectReasonDto {
  reason: string;
}

@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Post()
  async create(@Body() createClientDto: CreateClientDto): Promise<User> {
    try {
      return await this.clientService.create(createClientDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<User> {
    const client = await this.clientService.get(id);
    if (!client) {
      throw new HttpException('Cliente no encontrado', HttpStatus.NOT_FOUND);
    }
    return client;
  }

  @Get()
  async all(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '8',
  ): Promise<{ users: User[]; totalCount: number }> {
    return await this.clientService.all(
      parseInt(page),
      parseInt(pageSize),
    );
  }

  @Get('search/:query')
  async search(@Param('query') query: string): Promise<User[]> {
    const results = await this.clientService.searchUser(query);
    if (!results) {
      throw new HttpException('Error en la búsqueda', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return results;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
  ): Promise<User> {
    try {
      return await this.clientService.update(id, updateClientDto);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Put(':id/password')
  async updatePassword(
    @Param('id') id: string,
    @Body() updatePasswordDto: UpdatePasswordDto,
  ): Promise<User> {
    try {
      return await this.clientService.updatePassword(id, updatePasswordDto.password);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<User> {
    try {
      return await this.clientService.delete(id);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('signin')
  async signin(@Body() signInDto: SignInDto): Promise<User> {
    try {
      return await this.clientService.signin(signInDto.email, signInDto.password);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.UNAUTHORIZED);
    }
  }

  @Get(':userId/has-document-data')
  async hasDocumentData(@Param('userId') userId: string): Promise<{ hasData: boolean }> {
    try {
      const hasData = await this.clientService.hasDocumentData(userId);
      return { hasData };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Put(':userId/document')
  async updateDocument(
    @Param('userId') userId: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
  ): Promise<User> {
    try {
      const user = await this.clientService.updateDocument(
        userId,
        updateDocumentDto.documentSides,
        updateDocumentDto.number,
      );
      if (!user) {
        throw new HttpException('Error al actualizar documento', HttpStatus.BAD_REQUEST);
      }
      return user;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get(':userId/documents')
  async listDocuments(@Param('userId') userId: string): Promise<Document[]> {
    try {
      return await this.clientService.listDocuments(userId);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get(':userId/document')
  async getDocumentByUserId(@Param('userId') userId: string): Promise<Document> {
    const document = await this.clientService.getDocumentByUserId(userId);
    if (!document) {
      throw new HttpException('Documento no encontrado', HttpStatus.NOT_FOUND);
    }
    return document;
  }

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

  @Get('all/info')
  async getAllClientsInfo(): Promise<{ id: string; email: string; names: string }[]> {
    return await this.clientService.getAllClientsInfo();
  }
}