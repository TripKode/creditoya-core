// mail.dto.ts
import { Transform } from 'class-transformer';
import { IsString, IsEmail, IsOptional, IsArray, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

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

export class SendCustomEmailDto {
  @IsEmail({}, { message: 'El email debe tener un formato válido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  email: string;

  @IsString({ message: 'El asunto debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El asunto es requerido' })
  @MaxLength(200, { message: 'El asunto no puede exceder 200 caracteres' })
  @Transform(({ value }) => value?.trim())
  subject: string;

  @IsString({ message: 'El mensaje debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El mensaje es requerido' })
  @MinLength(10, { message: 'El mensaje debe tener al menos 10 caracteres' })
  @MaxLength(5000, { message: 'El mensaje no puede exceder 5000 caracteres' })
  @Transform(({ value }) => value?.trim())
  message: string;

  @IsOptional()
  @IsString({ message: 'El nombre del remitente debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El nombre del remitente no puede exceder 100 caracteres' })
  @Transform(({ value }) => value?.trim())
  recipientName?: string;

  @IsOptional()
  @IsString({ message: 'La prioridad debe ser una cadena de texto' })
  priority?: 'high' | 'normal' | 'low';

  // Los archivos se manejan por separado en el interceptor
  files?: Express.Multer.File[];
}