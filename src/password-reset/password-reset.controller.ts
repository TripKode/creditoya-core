import { Controller, Get, Post, Body, Patch, Param, Delete, BadRequestException, Query } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';
import { GenerateMagicLinkDto, ResetPasswordDto, ValidateTokenDto } from './dto/create-password-reset.dto';

@Controller('password-reset')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) { }

  @Post('generate-link')
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
  async validateToken(@Query() validateTokenDto: ValidateTokenDto) {
    const { token } = validateTokenDto;

    if (!token) {
      throw new BadRequestException('Token es requerido');
    }

    return await this.passwordResetService.validateResetToken(token);
  }

  @Post('reset')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;

    if (!token || !newPassword) {
      throw new BadRequestException('Token y nueva contraseña son requeridos');
    }

    return await this.passwordResetService.resetPassword(token, newPassword);
  }
}
