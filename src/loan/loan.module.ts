import { Module } from '@nestjs/common';
import { LoanService } from './loan.service';
import { LoanController } from './loan.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailModule } from 'src/mail/mail.module';
import { PdfsModule } from 'src/pdfs/pdfs.module';
import { GoogleCloudModule } from 'src/gcp/gcp.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module'; // Import CombinedAuthGuard
import { ClientAuthGuard } from 'src/auth/guards/client-auth.guard';
import { IntranetAuthGuard } from 'src/auth/guards/intranet-auth.guard';
import { CombinedAuthGuard } from 'src/auth/guards/combined-auth.guard';
import { LoanDisbursementService } from './services/disbursed.service';
import { LoanDocumentService } from './services/document.service';
import { LoanManagementService } from './services/loan-managment.service';
import { QueryService } from './services/query.service';
import { StatusService } from './services/status.service';
import { UtilityService } from './services/utility.service';
import { ApiTags } from '@nestjs/swagger';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    PdfsModule,
    GoogleCloudModule,
    CloudinaryModule,
  ],
  controllers: [LoanController],
  providers: [
    LoanService,
    ClientAuthGuard, // Add ClientAuthGuard as a provider
    IntranetAuthGuard, // Add IntranetAuthGuard as a provider if not already provided elsewhere
    CombinedAuthGuard, // Add CombinedAuthGuard as a provider

    LoanDisbursementService,
    LoanDocumentService,
    LoanManagementService,
    QueryService,
    StatusService,
    UtilityService,
    
  ],
})
export class LoanModule {}