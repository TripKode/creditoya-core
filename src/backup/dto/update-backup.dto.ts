import { PartialType } from '@nestjs/mapped-types';
import { BackupInfo } from './create-backup.dto';

export class UpdateBackupDto extends PartialType(BackupInfo) {}
