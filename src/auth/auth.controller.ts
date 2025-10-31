import { Controller, Post, Body, UseGuards, Get, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalClientAuthGuard } from './guards/local-client-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { LocalIntranetAuthGuard } from './guards/local-intranet-auth.guard';
import { ClientAuthGuard } from './guards/client-auth.guard';
import { IntranetAuthGuard } from './guards/intranet-auth.guard';
import { DevGuard } from './guards/dev.guard';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse
} from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @UseGuards(LocalClientAuthGuard)
  @Post('login/client')
  @ApiOperation({ summary: 'Iniciar sesión como cliente' })
  @ApiResponse({ status: 200, description: 'Login exitoso' })
  @ApiUnauthorizedResponse({ description: 'Credenciales inválidas' })
  async loginClient(
    @CurrentUser() user,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.authService.loginClient(user, response);
    } catch (error) {
      console.error('Error in client login:', error);
      throw error;
    }
  }

  // AuthController - loginIntranet endpoint
  @UseGuards(LocalIntranetAuthGuard)
  @Post('login/intranet')
  @ApiOperation({ summary: 'Iniciar sesión como usuario de intranet' })
  @ApiResponse({ status: 200, description: 'Login exitoso' })
  @ApiUnauthorizedResponse({ description: 'Credenciales inválidas' })
  async loginIntranet(
    @CurrentUser() user,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.authService.loginIntranet(user, response);
    } catch (error) {
      console.error('Error in intranet login:', error);
      throw error;
    }
  }

  // @UseGuards(LocalClientAuthGuard)
  @Post('register/client')
  @ApiOperation({ summary: 'Registrar nuevo cliente' })
  @ApiBody({ description: 'Datos del cliente a registrar' })
  @ApiResponse({ status: 201, description: 'Cliente registrado exitosamente' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  async registerClient(@Body() userData) {
    return this.authService.registerClient(userData);
  }

  @UseGuards(DevGuard)
  @Post('register/intranet')
  @ApiOperation({ summary: 'Registrar nuevo usuario de intranet (solo desarrollo)' })
  @ApiBody({ description: 'Datos del usuario de intranet a registrar' })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente' })
  @ApiUnauthorizedResponse({ description: 'No autorizado' })
  @ApiBadRequestResponse({ description: 'Datos inválidos' })
  async registerIntranet(@Body() userData) {
    return this.authService.registerIntranet(userData);
  }

  // Verificar autenticación del cliente
  @UseGuards(ClientAuthGuard)
  @Get('me/client')
  @ApiOperation({ summary: 'Obtener perfil del cliente autenticado' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Perfil del cliente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  async getClientProfile(@CurrentUser() user) {
    console.log(user);
    // Obtener el perfil completo del usuario desde la base de datos
    return this.authService.getClientProfile(user.id);
  }

  // Verificar autenticación de intranet
  @UseGuards(IntranetAuthGuard)
  @Get('me/intranet')
  @ApiOperation({ summary: 'Obtener perfil del usuario de intranet autenticado' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Perfil del usuario de intranet' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  async getIntranetProfile(@CurrentUser() user) {
    // Obtener el perfil completo del usuario desde la base de datos
    return this.authService.getIntranetProfile(user.id);
  }

  // AuthController - logoutClient endpoint
  @UseGuards(ClientAuthGuard)
  @Post('logout/client')
  @ApiOperation({ summary: 'Cerrar sesión del cliente' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Sesión cerrada correctamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  async logoutClient(
    @CurrentUser() user,
    @Res({ passthrough: true }) response: Response
  ) {
    try {
      // Also revoke the token if you implement a token blacklist
      await this.authService.revokeToken(
        user.id,
        'client',
        'creditoya_token',
        response
      );

      return { message: 'Sesión cerrada correctamente' };
    } catch (error) {
      console.error('Error in client logout:', error);
      throw error;
    }
  }

  // AuthController - logoutIntranet endpoint
  @UseGuards(IntranetAuthGuard)
  @Post('logout/intranet')
  @ApiOperation({ summary: 'Cerrar sesión del usuario de intranet' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Sesión cerrada correctamente' })
  @ApiUnauthorizedResponse({ description: 'No autenticado' })
  async logoutIntranet(
    @CurrentUser() user,
    @Res({ passthrough: true }) response: Response
  ) {
    try {
      // Also revoke the token if you implement a token blacklist
      await this.authService.revokeToken(
        user.id,
        'intranet',
        'intranet_token',
        response
      );
      return { message: 'Sesión cerrada correctamente' };
    } catch (error) {
      console.error('Error in intranet logout:', error);
      throw error;
    }
  }

  // Enviar PIN de autenticación por email
  @Post('send-pin')
  @ApiOperation({ summary: 'Enviar código PIN de autenticación por email' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Correo electrónico del usuario' }
      },
      required: ['email']
    }
  })
  @ApiResponse({ status: 200, description: 'Código enviado exitosamente' })
  @ApiBadRequestResponse({ description: 'Usuario no encontrado o cuenta suspendida' })
  async sendAuthPin(@Body() body: { email: string }) {
    return await this.authService.sendAuthPin(body.email);
  }

  // Verificar PIN y autenticar
  @Post('verify-pin')
  @ApiOperation({ summary: 'Verificar código PIN y autenticar usuario' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Correo electrónico del usuario' },
        pin: { type: 'string', description: 'Código PIN de 6 dígitos' }
      },
      required: ['email', 'pin']
    }
  })
  @ApiResponse({ status: 200, description: 'Autenticación exitosa' })
  @ApiBadRequestResponse({ description: 'Código incorrecto, expirado o usuario no encontrado' })
  async verifyAuthPin(
    @Body() body: { email: string; pin: string },
    @Res({ passthrough: true }) response: Response
  ) {
    return await this.authService.verifyAuthPin(body.email, body.pin, response);
  }
}