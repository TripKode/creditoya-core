import { Module } from '@nestjs/common';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailModule } from 'src/mail/mail.module';
import { GoogleCloudModule } from 'src/gcp/gcp.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { ClientAuthGuard } from 'src/auth/guards/client-auth.guard';
import { IntranetAuthGuard } from 'src/auth/guards/intranet-auth.guard';
import { CombinedAuthGuard } from 'src/auth/guards/combined-auth.guard';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    GoogleCloudModule,
    CloudinaryModule,
  ],
  controllers: [ClientController],
  providers: [
    ClientService,
    ClientAuthGuard, // Add ClientAuthGuard as a provider
    IntranetAuthGuard, // Add IntranetAuthGuard as a provider if not already provided elsewhere
    CombinedAuthGuard, // Add CombinedAuthGuard as a provider
  ],
  exports: [ClientService]
})
export class ClientModule { }
