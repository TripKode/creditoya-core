import { Controller, Post, Get, Body, Param, UseGuards, Logger } from '@nestjs/common';
import { BackupService } from './backup.service';
import { IntranetAuthGuard } from 'src/auth/guards/intranet-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CombinedAuthGuard } from 'src/auth/guards/combined-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse
} from '@nestjs/swagger';

@ApiTags('backup')
@Controller('admin/database')
export class BackupController {
  private readonly logger = new Logger(BackupController.name);

  constructor(private readonly databaseBackupService: BackupService) {}

  @Post('backup')
  @ApiOperation({ summary: 'Crear backup manual de la base de datos' })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Backup creado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiBadRequestResponse({ description: 'Error al crear el backup' })
  async createBackup() {
    this.logger.log('Solicitud de backup manual recibida');
    return this.databaseBackupService.createBackupNow();
  }

  @Get('backups')
  @ApiOperation({ summary: 'Listar todos los backups disponibles' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Lista de backups disponibles' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  async listBackups() {
    this.logger.log('Solicitud para listar backups recibida');
    return this.databaseBackupService.listAvailableBackups();
  }

  @Post('restore')
  @ApiOperation({ summary: 'Restaurar base de datos desde un backup' })
  @ApiBody({ schema: { type: 'object', properties: { backupPath: { type: 'string', description: 'Ruta del archivo de backup' } } } })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Base de datos restaurada exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiBadRequestResponse({ description: 'Archivo de backup no válido o error en restauración' })
  async restoreBackup(@Body() body: { backupPath: string }) {
    this.logger.log(`Solicitud para restaurar backup: ${body.backupPath}`);
    return this.databaseBackupService.restoreFromBackup(body.backupPath);
  }

  @Get('backup/download/*path')
  @ApiOperation({ summary: 'Generar URL de descarga para un backup' })
  @ApiParam({ name: 'path', description: 'Ruta del archivo de backup' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'URL de descarga generada' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  @ApiNotFoundResponse({ description: 'Archivo de backup no encontrado' })
  async generateDownloadUrl(@Param('path') backupPath: string) {
    this.logger.log(`Solicitud de URL de descarga para: ${backupPath}`);
    return this.databaseBackupService.generateBackupDownloadUrl(`database_backups/${backupPath}`);
  }
}