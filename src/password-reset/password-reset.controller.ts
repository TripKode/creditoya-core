import { Controller, Get, Post, Body, Patch, Param, Delete, BadRequestException, Query } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';
import { GenerateMagicLinkDto, ResetPasswordDto, ValidateTokenDto } from './dto/create-password-reset.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
  ApiBadRequestResponse
} from '@nestjs/swagger';

@ApiTags('password-reset')
@Controller('password-reset')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) { }

  @Post('generate-link')
  @ApiOperation({ summary: 'Generar enlace mágico para restablecer contraseña' })
  @ApiBody({ type: GenerateMagicLinkDto, description: 'Datos para generar el enlace de recuperación' })
  @ApiResponse({ status: 201, description: 'Enlace mágico generado exitosamente' })
  @ApiBadRequestResponse({ description: 'Datos inválidos o usuario no encontrado' })
  async generateMagicLink(@Body() generateMagicLinkDto: GenerateMagicLinkDto) {
    const { email, userType } = generateMagicLinkDto;

    if (!email || !userType) {
      throw new BadRequestException('Email y tipo de usuario son requeridos');
    }

    if (userType !== 'client' && userType !== 'intranet') {
      throw new BadRequestException('Tipo de usuario debe ser "client" o "intranet"');
    }

    return await this.passwordResetService.generateMagicLink(email, userType);
  }

  @Get('validate-token')
  @ApiOperation({ summary: 'Validar token de restablecimiento de contraseña' })
  @ApiQuery({ name: 'token', description: 'Token de restablecimiento', required: true })
  @ApiResponse({ status: 200, description: 'Token válido' })
  @ApiBadRequestResponse({ description: 'Token inválido o expirado' })
  async validateToken(@Query() validateTokenDto: ValidateTokenDto) {
    const { token } = validateTokenDto;

    if (!token) {
      throw new BadRequestException('Token es requerido');
    }

    return await this.passwordResetService.validateResetToken(token);
  }

  @Post('reset')
  @ApiOperation({ summary: 'Restablecer contraseña usando token' })
  @ApiBody({ type: ResetPasswordDto, description: 'Token y nueva contraseña' })
  @ApiResponse({ status: 200, description: 'Contraseña restablecida exitosamente' })
  @ApiBadRequestResponse({ description: 'Token inválido, expirado o datos incorrectos' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;

    if (!token || !newPassword) {
      throw new BadRequestException('Token y nueva contraseña son requeridos');
    }

    return await this.passwordResetService.resetPassword(token, newPassword);
  }
}
