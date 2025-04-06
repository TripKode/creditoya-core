import { Module } from '@nestjs/common';
import { GoogleCloudService } from './gcp.service';

@Module({
  providers: [GoogleCloudService],
  exports: [GoogleCloudService]
})
export class GoogleCloudModule {}
