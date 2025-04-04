import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtIntranetStrategy extends PassportStrategy(Strategy, 'jwt-intranet') {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: any) {
    if (payload.type !== 'intranet') {
      throw new UnauthorizedException('Token inválido para usuarios de intranet');
    }

    const user = await this.prisma.usersIntranet.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return { 
      id: payload.sub, 
      email: payload.email,
      rol: payload.rol,
      type: 'intranet' 
    };
  }
}