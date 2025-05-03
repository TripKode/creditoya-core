import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { User, UsersIntranet } from '@prisma/client';
import { ClientService } from 'src/client/client.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private clientService: ClientService
  ) { }

  // Para usuarios normales (clientes)
  async validateClient(email: string, password: string): Promise<User> {
    // Buscamos en la base de datos
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
    // Buscamos en la base de datos
    const user = await this.prisma.usersIntranet.findUnique({
      where: { email },
    });

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
  async loginClient(user: User, response?: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      type: 'client'
    };

    const token = this.jwtService.sign(payload);

    if (response && typeof response.cookie === 'function') {
      try {
        response.cookie('creditoya_token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 86400000, // 24 hours in milliseconds
          path: '/',
          sameSite: 'none'
        });
      } catch (error) {
        console.error('Error setting cookie:', error);
        // Continúa la ejecución incluso si falla la configuración de la cookie
      }
    } else {
      console.warn('Response object is invalid or missing cookie method');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        names: user.names,
        firstLastName: user.firstLastName,
        secondLastName: user.secondLastName,
        avatar: user.avatar,
      },
      accessToken: token,
    };
  }

  // Generar token para usuarios de intranet
  async loginIntranet(user: UsersIntranet) {
    const payload = {
      sub: user.id,
      email: user.email,
      rol: user.rol,
      type: 'intranet'
    };

    const token = this.jwtService.sign(payload);

    console.log('Token generado:', token, payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        lastNames: user.lastNames,
        avatar: user.avatar,
        rol: user.rol,
      },
      accessToken: token,
    };
  }

  // Revocar token (logout)
  async revokeToken(userId: string, userType: 'client' | 'intranet'): Promise<void> {
    // Token revocation would need to be implemented differently without Redis
    // Consider using a database table to track revoked tokens or implementing
    // a shorter token expiration with refresh tokens
    console.log(`Token revoked for ${userType} with ID ${userId}`);
  }

  // Verificar si un token está en la lista negra
  async isTokenRevoked(userId: string, userType: 'client' | 'intranet'): Promise<boolean> {
    // Without Redis, you would need to implement this differently
    // For now, assume tokens are always valid (not revoked)
    return false;
  }

  // Hash de contraseñas para registro
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt();
    return bcrypt.hash(password, salt);
  }

  // Obtener perfil de cliente
  async getClientProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        LoanApplication: true,
      }
    });

    console.log(user);

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return { user };
  }

  // Obtener perfil de intranet
  async getIntranetProfile(userId: string) {
    const user = await this.prisma.usersIntranet.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        lastNames: true,
        avatar: true,
        rol: true,
        isActive: true,
        // otros campos que quieras incluir pero NO la contraseña
      }
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return { user };
  }

  async registerClient(data: User) {
    const newClient = await this.clientService.create(data);
    if (!newClient) throw new Error('Error al crear cliente');
    return await this.loginClient(newClient);
  }
}