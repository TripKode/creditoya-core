import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { StatusLoan } from '@prisma/client';

export class ChangeLoanStatusDto {
  @IsNotEmpty()
  @IsEnum(StatusLoan)
  status: StatusLoan;
  
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
  @IsString()
  employeeId?: string;
}