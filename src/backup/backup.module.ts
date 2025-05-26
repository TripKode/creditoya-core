import { Module } from '@nestjs/common';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { CombinedAuthGuard } from 'src/auth/guards/combined-auth.guard';
import { IntranetAuthGuard } from 'src/auth/guards/intranet-auth.guard';
import { ClientAuthGuard } from 'src/auth/guards/client-auth.guard';
import { JwtClientStrategy } from 'src/auth/strategies/jwt-client.strategy';
import { JwtIntranetStrategy } from 'src/auth/strategies/jwt-intranet.strategy';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
  ],
  controllers: [BackupController],
  providers: [
    // Estrategias JWT necesarias
    JwtClientStrategy,
    JwtIntranetStrategy,

    // Guards necesarios
    ClientAuthGuard,
    IntranetAuthGuard,
    CombinedAuthGuard,
    RolesGuard,
    BackupService
  ],
  exports: [BackupService]
})
export class BackupModule { }
