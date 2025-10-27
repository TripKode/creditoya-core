import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';
import { ApiTags } from '@nestjs/swagger';

@Module({
  providers: [McpService],
  controllers: [McpController]
})
export class McpModule {}
