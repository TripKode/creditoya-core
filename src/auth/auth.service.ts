// auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { User, UsersIntranet } from '@prisma/client';
import { RedisService } from 'src/redis/redis.service';
import { ClientService } from 'src/client/client.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redis: RedisService,
    private clientService: ClientService
  ) { }

  // Para usuarios normales (clientes)
  async validateClient(email: string, password: string): Promise<User> {
    // Primero intentamos obtener el usuario desde Redis
    const cachedUserKey = `user:email:${email}`;
    const cachedUser = await this.redis.get<User>(cachedUserKey);

    let user: User;

    if (cachedUser) {
      user = cachedUser;
    } else {
      // Si no está en caché, buscamos en la base de datos
      const foundUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!foundUser) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      user = foundUser;

      // Guardamos en caché para futuras consultas
      if (user) {
        await this.redis.set(cachedUserKey, user, 3600); // Caché por 1 hora
      }
    }

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
    // Primero intentamos obtener el usuario desde Redis
    const cachedUserKey = `intranet:email:${email}`;
    const cachedUser = await this.redis.get<UsersIntranet>(cachedUserKey);

    let user: UsersIntranet;

    if (cachedUser) {
      user = cachedUser;
    } else {
      // Si no está en caché, buscamos en la base de datos
      const foundUser = await this.prisma.usersIntranet.findUnique({
        where: { email },
      });

      if (!foundUser) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      user = foundUser;

      // Guardamos en caché para futuras consultas
      if (user) {
        await this.redis.set(cachedUserKey, user, 3600); // Caché por 1 hora
      }
    }

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

  // Generar token para clientes con almacenamiento en Redis
  async loginClient(user: User, response?: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      type: 'client'
    };

    const token = this.jwtService.sign(payload);

    // Guardar token en Redis con el ID del usuario como clave
    await this.redis.set(
      `auth:token:client:${user.id}`,
      token,
      86400 // 24 horas
    );

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

  // Generar token para usuarios de intranet con Redis
  async loginIntranet(user: UsersIntranet) {
    const payload = {
      sub: user.id,
      email: user.email,
      rol: user.rol,
      type: 'intranet'
    };

    const token = this.jwtService.sign(payload);

    console.log('Token generado:', token, payload);

    // Guardar token en Redis
    await this.redis.set(
      `auth:token:intranet:${user.id}`,
      token,
      86400 // 24 horas
    );

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
    await this.redis.del(`auth:token:${userType}:${userId}`);
  }

  // Verificar si un token está en la lista negra
  async isTokenRevoked(userId: string, userType: 'client' | 'intranet'): Promise<boolean> {
    const storedToken = await this.redis.get(`auth:token:${userType}:${userId}`);
    return !storedToken;
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
      select: {
        id: true,
        email: true,
        names: true,
        firstLastName: true,
        secondLastName: true,
        avatar: true,
        isBan: true,
        // otros campos que quieras incluir pero NO la contraseña
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