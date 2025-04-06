import { Module } from '@nestjs/common';
import { PdfsService } from './pdfs.service';
import { PdfsController } from './pdfs.controller';
import { GoogleCloudModule } from 'src/gcp/gcp.module';

@Module({
  imports: [GoogleCloudModule],
  controllers: [PdfsController],
  providers: [PdfsService],
})
export class PdfsModule {}
