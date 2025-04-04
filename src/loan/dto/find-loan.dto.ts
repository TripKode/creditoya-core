import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { StatusLoan } from '@prisma/client';

export class FindLoanDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
  
  @IsOptional()
  @IsEnum(StatusLoan)
  status?: StatusLoan;
  
  @IsOptional()
  @IsString()
  fromDate?: string;
  
  @IsOptional()
  @IsString()
  toDate?: string;
}