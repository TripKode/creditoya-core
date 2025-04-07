// auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { User, UsersIntranet } from '@prisma/client';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redis: RedisService,
  ) {}

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
  async loginClient(user: User) {
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
}