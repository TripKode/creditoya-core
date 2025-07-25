import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { LoanModule } from './loan/loan.module';
import { ConfigModule } from '@nestjs/config';
import { ClientModule } from './client/client.module';
import { CatchModule } from './catch/catch.module';
import { GoogleCloudModule } from './gcp/gcp.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { BackupModule } from './backup/backup.module';
import { PdfsModule } from './pdfs/pdfs.module';
import { PasswordResetModule } from './password-reset/password-reset.module';
import { CustomLoggerService } from './services/logger.service';

@Module({
  imports: [
    PrismaModule,
    LoanModule,
    ConfigModule.forRoot({ isGlobal: true }),
    ClientModule,
    CatchModule,
    GoogleCloudModule,
    CloudinaryModule,
    MailModule,
    AuthModule,
    BackupModule,
    PdfsModule,
    PasswordResetModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    CustomLoggerService
  ],
  exports: [CustomLoggerService],
})
export class AppModule {}
