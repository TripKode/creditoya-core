import { Module } from '@nestjs/common';
import { PdfsService } from './pdfs.service';
import { PdfsController } from './pdfs.controller';
import { GoogleCloudModule } from 'src/gcp/gcp.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [GoogleCloudModule, PrismaModule],
  controllers: [PdfsController],
  providers: [PdfsService],
  exports: [PdfsService],
})
export class PdfsModule {}
