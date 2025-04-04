import { Module } from '@nestjs/common';
import { CatchService } from './catch.service';
import { CatchController } from './catch.controller';

@Module({
  controllers: [CatchController],
  providers: [CatchService],
})
export class CatchModule {}
