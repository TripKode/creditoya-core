import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';

@Injectable()
export class JwtClientStrategy extends PassportStrategy(Strategy, 'jwt-client') {
  constructor(private prisma: PrismaService) {
    super({
      // Usar una función que extraiga el token tanto de cookies como del header Authorization
      jwtFromRequest: (req) => {
        // Primero intentar desde cookies
        let token = null;
        if (req && req.cookies) {
          token = req.cookies['creditoya_token'];
        }

        // Si no hay token en cookies, intentar desde el header Authorization
        if (!token && req.headers.authorization) {
          const authHeader = req.headers.authorization;
          if (authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
          }
        }

        // console.log('Token final extraído:', token ? 'Presente' : 'Ausente');
        return token;
      },
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    // console.log('Payload recibido:', payload); // Verificar el payload
    // console.log('Tipo de payload:', payload.type); // Verificar el tipo

    if (payload.type !== 'client') {
      console.log('Error: token no es de tipo client');
      throw new UnauthorizedException('Token inválido para clientes');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    // console.log('Usuario encontrado:', user ? 'Sí' : 'No'); // Verificar si se encontró el usuario

    if (!user || user.isBan) {
      console.log('Error: usuario no encontrado o baneado');
      throw new UnauthorizedException();
    }

    return {
      id: payload.sub,
      email: payload.email,
      type: 'client'
    };
  }
}