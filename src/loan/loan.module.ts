import { Module } from '@nestjs/common';
import { LoanService } from './loan.service';
import { LoanController } from './loan.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RedisModule } from 'src/redis/redis.module';
import { MailModule } from 'src/mail/mail.module';
import { PdfsModule } from 'src/pdfs/pdfs.module';
import { GoogleCloudModule } from 'src/gcp/gcp.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module'; // Import CombinedAuthGuard
import { ClientAuthGuard } from 'src/auth/guards/client-auth.guard';
import { IntranetAuthGuard } from 'src/auth/guards/intranet-auth.guard';
import { CombinedAuthGuard } from 'src/auth/guards/combined-auth.guard';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    MailModule,
    PdfsModule,
    GoogleCloudModule,
    CloudinaryModule,
    // If ClientAuthGuard is in another module, import that module here
    // AuthModule, // Uncomment and replace with the correct module name
  ],
  controllers: [LoanController],
  providers: [
    LoanService,
    ClientAuthGuard, // Add ClientAuthGuard as a provider
    IntranetAuthGuard, // Add IntranetAuthGuard as a provider if not already provided elsewhere
    CombinedAuthGuard, // Add CombinedAuthGuard as a provider
  ],
})
export class LoanModule {}