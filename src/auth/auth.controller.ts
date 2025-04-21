import { Controller, Post, Body, UseGuards, Get, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalClientAuthGuard } from './guards/local-client-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { LocalIntranetAuthGuard } from './guards/local-intranet-auth.guard';
import { ClientAuthGuard } from './guards/client-auth.guard';
import { IntranetAuthGuard } from './guards/intranet-auth.guard';
import { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Login de cliente
  @UseGuards(LocalClientAuthGuard)
  @Post('login/client')
  async loginClient(
    @CurrentUser() user,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.loginClient(user, response);
  }

  // @UseGuards(LocalClientAuthGuard)
  @Post('register/client')
  async registerClient(@Body() userData) {
    return this.authService.registerClient(userData);
  }

  // Login de intranet
  @UseGuards(LocalIntranetAuthGuard)
  @Post('login/intranet')
  async loginIntranet(@CurrentUser() user) {
    return this.authService.loginIntranet(user);
  }

  // Verificar autenticación del cliente
  @UseGuards(ClientAuthGuard)
  @Get('me/client')
  async getClientProfile(@CurrentUser() user) {
    console.log(user);
    // Obtener el perfil completo del usuario desde la base de datos
    return this.authService.getClientProfile(user.id);
  }

  // Verificar autenticación de intranet
  @UseGuards(IntranetAuthGuard)
  @Get('me/intranet')
  async getIntranetProfile(@CurrentUser() user) {
    // Obtener el perfil completo del usuario desde la base de datos
    return this.authService.getIntranetProfile(user.id);
  }

  // Logout para clientes
  @UseGuards(ClientAuthGuard)
  @Post('logout/client')
  async logoutClient(@CurrentUser() user) {
    return this.authService.revokeToken(user.id, 'client');
  }

  // Logout para intranet
  @UseGuards(IntranetAuthGuard)
  @Post('logout/intranet')
  async logoutIntranet(@CurrentUser() user) {
    return this.authService.revokeToken(user.id, 'intranet');
  }
}