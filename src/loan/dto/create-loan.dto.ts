// src/modules/loan/dto/create-loan.dto.ts
import { IsString, IsBoolean, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateLoanApplicationDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  employeeId?: string;
  
  @IsOptional()
  @IsString()
  fisrt_flyer?: string;
  
  @IsOptional()
  @IsString()
  upid_first_flayer?: string;
  
  @IsOptional()
  @IsString()
  second_flyer?: string;
  
  @IsOptional()
  @IsString()
  upid_second_flyer?: string;
  
  @IsOptional()
  @IsString()
  third_flyer?: string;
  
  @IsOptional()
  @IsString()
  upid_third_flayer?: string;
  
  @IsNotEmpty()
  @IsString()
  cantity: string;
  
  @IsNotEmpty()
  @IsBoolean()
  bankSavingAccount: boolean;
  
  @IsNotEmpty()
  @IsString()
  bankNumberAccount: string;
  
  @IsNotEmpty()
  @IsString()
  entity: string;
  
  @IsOptional()
  @IsString()
  labor_card?: string;
  
  @IsOptional()
  @IsString()
  upid_labor_card?: string;
  
  @IsNotEmpty()
  @IsBoolean()
  terms_and_conditions: boolean;
  
  @IsNotEmpty()
  @IsString()
  signature: string;
  
  @IsNotEmpty()
  @IsString()
  upSignatureId: string;
}