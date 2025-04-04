// mail.dto.ts
import { IsString, IsEmail, IsOptional, IsArray } from 'class-validator';

export class ActiveAccountDto {
  @IsString()
  completeName: string;

  @IsEmail()
  mail: string;

  @IsString()
  password: string;
}

export class MailByUserDto {
  @IsString()
  subject: string;

  @IsString()
  content: string;

  @IsArray()
  addressee: string | string[];
}

export class MailByUserImageDto {
  @IsEmail()
  addressee: string;

  @IsString()
  content: string;

  @IsString()
  subject: string;
}

export class ChangeCantityMailDto {
  @IsString()
  employeeName: string;

  @IsString()
  loanId: string;

  @IsString()
  reason_aproved: string;

  @IsString()
  cantity_aproved: string;

  @IsEmail()
  mail: string;
}

export class ChangeStatusMailDto {
  @IsString()
  newStatus: string;

  @IsString()
  employeeName: string;

  @IsString()
  loanId: string;

  @IsEmail()
  mail: string;
}

export class DeleteDocMailDto {
  @IsString()
  loanId: string;

  @IsEmail()
  mail: string;
}