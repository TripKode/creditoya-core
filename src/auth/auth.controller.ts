import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalClientAuthGuard } from './guards/local-client-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { LocalIntranetAuthGuard } from './guards/local-intranet-auth.guard';

// Guards para login local
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalClientAuthGuard)
  @Post('login/client')
  async loginClient(@CurrentUser() user) {
    return this.authService.loginClient(user);
  }

  @UseGuards(LocalIntranetAuthGuard)
  @Post('login/intranet')
  async loginIntranet(@CurrentUser() user) {
    return this.authService.loginIntranet(user);
  }
}