// src/modules/loan/dto/update-loan.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateLoanApplicationDto } from './create-loan.dto';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StatusLoan } from '@prisma/client';

export class UpdateLoanApplicationDto extends PartialType(CreateLoanApplicationDto) {
  @IsOptional()
  @IsString()
  reasonReject?: string;
  
  @IsOptional()
  @IsString()
  reasonChangeCantity?: string;
  
  @IsOptional()
  @IsString()
  newCantity?: string;
  
  @IsOptional()
  @IsEnum(StatusLoan)
  status?: StatusLoan;
}