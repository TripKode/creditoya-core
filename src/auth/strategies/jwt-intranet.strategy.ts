import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';

@Injectable()
export class JwtIntranetStrategy extends PassportStrategy(Strategy, 'jwt-intranet') {
  constructor(private prisma: PrismaService) {
    super({
      // Match the approach used in JwtClientStrategy
      jwtFromRequest: (req) => {
        // First try from cookies
        let token = null;
        if (req && req.cookies) {
          token = req.cookies['intranet_token'];
        }

        // If no token in cookies, try from Authorization header
        if (!token && req.headers.authorization) {
          const authHeader = req.headers.authorization;
          if (authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
          }
        }

        return token;
      },
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
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

// Función para extraer el JWT de la cookie
function extractJwtFromCookie(cookieName: string) {
  return function (req: Request) {
    let token = null;
    if (req && req.cookies) {
      token = req.cookies[cookieName];
    }
    return token;
  };
}