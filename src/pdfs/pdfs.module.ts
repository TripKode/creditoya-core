import { Module } from '@nestjs/common';
import { PdfsService } from './pdfs.service';
import { PdfsController } from './pdfs.controller';
import { GoogleCloudModule } from 'src/gcp/gcp.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import {
  SKELETON_JSON_00,
  SKELETON_JSON_01,
  SKELETON_JSON_02,
  SKELETON_JSON_03,
  SKELETON_SUB_JSON_02,
  skeletonJson00,
  skeletonJson01,
  skeletonJson02,
  skeletonSubJson02,
  skeletonJson03,
} from 'templates/AboutPdf';
import { CombinedAuthGuard } from 'src/auth/guards/combined-auth.guard';
import { IntranetAuthGuard } from 'src/auth/guards/intranet-auth.guard';
import { ClientAuthGuard } from 'src/auth/guards/client-auth.guard';

@Module({
  imports: [GoogleCloudModule, PrismaModule],
  controllers: [PdfsController],
  providers: [
    PdfsService,
    ClientAuthGuard, // Add ClientAuthGuard as a provider
    IntranetAuthGuard, // Add IntranetAuthGuard as a provider if not already provided elsewhere
    CombinedAuthGuard, // Add CombinedAuthGuard as a provider
    {
      provide: SKELETON_JSON_00,
      useValue: skeletonJson00,
    },
    {
      provide: SKELETON_JSON_01,
      useValue: skeletonJson01,
    },
    {
      provide: SKELETON_JSON_02,
      useValue: skeletonJson02,
    },
    {
      provide: SKELETON_SUB_JSON_02,
      useValue: skeletonSubJson02,
    },
    {
      provide: SKELETON_JSON_03,
      useValue: skeletonJson03,
    }
  ],
  exports: [PdfsService],
})
export class PdfsModule { }
