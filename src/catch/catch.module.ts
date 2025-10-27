import { Module } from '@nestjs/common';
import { CatchService } from './catch.service';

@Module({
  providers: [CatchService],
})
export class CatchModule {}
