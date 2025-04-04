import { PartialType } from '@nestjs/mapped-types';
import { CreateGcpDto } from './create-gcp.dto';

export class UpdateGcpDto extends PartialType(CreateGcpDto) {}
