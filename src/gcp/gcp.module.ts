import { Module } from '@nestjs/common';
import { GoogleCloudService } from './gcp.service';
import { CredentialGCP } from 'templates/cloud';

@Module({
  providers: [
    GoogleCloudService,
    {
      provide: 'CREDENTIAL_GCP',
      useValue: CredentialGCP,
    }
  ],
  exports: [GoogleCloudService]
})
export class GoogleCloudModule {}
