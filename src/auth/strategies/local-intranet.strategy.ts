import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalIntranetStrategy extends PassportStrategy(Strategy, 'local-intranet') {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const user = await this.authService.validateIntranetUser(email, password);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}