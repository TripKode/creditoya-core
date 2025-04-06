import { Controller, Post, Get, Body, Param, UseGuards, Logger } from '@nestjs/common';
import { BackupService } from './backup.service';
import { IntranetAuthGuard } from 'src/auth/guards/intranet-auth.guard';

@Controller('admin/database')
@UseGuards(IntranetAuthGuard)
export class BackupController {
  private readonly logger = new Logger(BackupController.name);

  constructor(private readonly databaseBackupService: BackupService) {}

  @Post('backup')
  async createBackup() {
    this.logger.log('Solicitud de backup manual recibida');
    return this.databaseBackupService.createBackupNow();
  }

  @Get('backups')
  async listBackups() {
    this.logger.log('Solicitud para listar backups recibida');
    return this.databaseBackupService.listAvailableBackups();
  }

  @Post('restore')
  async restoreBackup(@Body() body: { backupPath: string }) {
    this.logger.log(`Solicitud para restaurar backup: ${body.backupPath}`);
    return this.databaseBackupService.restoreFromBackup(body.backupPath);
  }

  @Get('backup/download/*path')
  async generateDownloadUrl(@Param('path') backupPath: string) {
    this.logger.log(`Solicitud de URL de descarga para: ${backupPath}`);
    return this.databaseBackupService.generateBackupDownloadUrl(`database_backups/${backupPath}`);
  }
}