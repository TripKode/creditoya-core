import { Module } from '@nestjs/common';
import { GoogleCloudService } from './gcp.service';
import { CredentialGCP } from 'templates/cloud';
import { LoggerModule } from 'src/logger/logger.module';

@Module({
  providers: [
    GoogleCloudService,
    LoggerModule,
    {
      provide: 'CREDENTIAL_GCP',
      useValue: CredentialGCP,
    }
  ],
  exports: [GoogleCloudService]
})
export class GoogleCloudModule {}
