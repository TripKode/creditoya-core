// auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { User, UsersIntranet } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) { }

  // Para usuarios normales (clientes)
  async validateClient(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.isBan) {
      throw new UnauthorizedException('Su cuenta ha sido suspendida');
    }

    return user;
  }

  // Para usuarios de intranet
  async validateIntranetUser(email: string, password: string): Promise<UsersIntranet> {
    const user = await this.prisma.usersIntranet.findUnique({
      where: { email },
    });

    console.log("user: ", user);

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Su cuenta no está activa');
    }

    return user;
  }

  // Generar token para clientes
  async loginClient(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      type: 'client'
    };

    return {
      user: {
        id: user.id,
        email: user.email,
        names: user.names,
        firstLastName: user.firstLastName,
        secondLastName: user.secondLastName,
        avatar: user.avatar,
      },
      accessToken: this.jwtService.sign(payload),
    };
  }

  // Generar token para usuarios de intranet
  async loginIntranet(user: UsersIntranet) {
    const payload = {
      sub: user.id,
      email: user.email,
      rol: user.rol,
      type: 'intranet'
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        lastNames: user.lastNames,
        avatar: user.avatar,
        rol: user.rol,
      },
      accessToken: this.jwtService.sign(payload),
    };
  }

  // Hash de contraseñas para registro
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt();
    return bcrypt.hash(password, salt);
  }
}