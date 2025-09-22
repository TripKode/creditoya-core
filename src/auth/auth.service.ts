import { Injectable, UnauthorizedException, Logger, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { User, UsersIntranet } from '@prisma/client';
import { ClientService } from 'src/client/client.service';
import { Response } from 'express';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private clientService: ClientService,
  ) { }

  // Para usuarios normales (clientes)
  async validateClient(email: string, password: string): Promise<User> {
    this.logger.debug('Iniciando validación de cliente', { 
      email,
      timestamp: new Date().toISOString()
    });

    try {
      // Buscamos en la base de datos
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        this.logger.warn('Intento de login con email no registrado', { 
          email,
          reason: 'user_not_found'
        });
        throw new UnauthorizedException('Credenciales inválidas');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        this.logger.warn('Intento de login con contraseña incorrecta', { 
          email,
          userId: user.id,
          reason: 'invalid_password'
        });
        throw new UnauthorizedException('Credenciales inválidas');
      }

      if (user.isBan) {
        this.logger.warn('Intento de login de usuario suspendido', { 
          email,
          userId: user.id,
          reason: 'user_banned'
        });
        throw new UnauthorizedException('Su cuenta ha sido suspendida');
      }

      this.logger.debug('Cliente validado exitosamente', { 
        userId: user.id,
        email: user.email,
        userNames: `${user.names} ${user.firstLastName}`
      });

      return user;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error('Error durante validación de cliente', error, { 
        email,
        operation: 'validateClient'
      });
      throw new UnauthorizedException('Error interno del servidor');
    }
  }

  // Para usuarios de intranet
  async validateIntranetUser(email: string, password: string): Promise<UsersIntranet> {
    this.logger.debug('Iniciando validación de usuario intranet', { 
      email,
      timestamp: new Date().toISOString()
    });

    try {
      // Buscamos en la base de datos
      const user = await this.prisma.usersIntranet.findUnique({
        where: { email },
      });

      if (!user) {
        this.logger.warn('Intento de login intranet con email no registrado', { 
          email,
          reason: 'user_not_found'
        });
        throw new UnauthorizedException('Credenciales inválidas');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        this.logger.warn('Intento de login intranet con contraseña incorrecta', { 
          email,
          userId: user.id,
          reason: 'invalid_password'
        });
        throw new UnauthorizedException('Credenciales inválidas');
      }

      if (!user.isActive) {
        this.logger.warn('Intento de login de usuario intranet inactivo', { 
          email,
          userId: user.id,
          reason: 'user_inactive'
        });
        throw new UnauthorizedException('Su cuenta no está activa');
      }

      this.logger.debug('Usuario intranet validado exitosamente', { 
        userId: user.id,
        email: user.email,
        rol: user.rol,
        userName: `${user.name} ${user.lastNames}`
      });

      return user;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error('Error durante validación de usuario intranet', error, { 
        email,
        operation: 'validateIntranetUser'
      });
      throw new UnauthorizedException('Error interno del servidor');
    }
  }

  async loginClient(user: User, response?: any) {
    this.logger.debug('Iniciando proceso de login para cliente', { 
      userId: user.id,
      email: user.email
    });

    try {
      const payload = {
        sub: user.id,
        email: user.email,
        type: 'client'
      };

      const token = this.jwtService.sign(payload);

      // Set cookie with improved error handling
      if (response && typeof response.cookie === 'function') {
        try {
          response.cookie('creditoya_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 86400000, // 24 hours
            path: '/',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
          });
          
          this.logger.debug('Cookie de cliente establecida correctamente', { 
            userId: user.id,
            cookieName: 'creditoya_token'
          });
        } catch (error) {
          this.logger.error('Error estableciendo cookie de cliente', error, { 
            userId: user.id,
            cookieName: 'creditoya_token'
          });
        }
      }

      this.logger.debug('Login de cliente exitoso', { 
        userId: user.id,
        email: user.email,
        userNames: `${user.names} ${user.firstLastName}`,
        tokenGenerated: true
      });

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
    } catch (error) {
      this.logger.error('Error durante login de cliente', error, { 
        userId: user.id,
        email: user.email,
        operation: 'loginClient'
      });
      throw error;
    }
  }

  // Generar token para usuarios de intranet
  async loginIntranet(user: UsersIntranet, response?: any) {
    this.logger.debug('Iniciando proceso de login para usuario intranet', { 
      userId: user.id,
      email: user.email,
      rol: user.rol
    });

    try {
      const payload = {
        sub: user.id,
        email: user.email,
        rol: user.rol,
        type: 'intranet'
      };

      const token = this.jwtService.sign(payload);

      // Set cookie consistently with client login
      if (response && typeof response.cookie === 'function') {
        try {
          response.cookie('intranet_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 86400000, // 24 hours
            path: '/',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
          });
          
          this.logger.debug('Cookie de intranet establecida correctamente', { 
            userId: user.id,
            cookieName: 'intranet_token'
          });
        } catch (error) {
          this.logger.error('Error estableciendo cookie de intranet', error, { 
            userId: user.id,
            cookieName: 'intranet_token'
          });
        }
      }

      this.logger.debug('Login de intranet exitoso', { 
        userId: user.id,
        email: user.email,
        rol: user.rol,
        userName: `${user.name} ${user.lastNames}`,
        tokenGenerated: true
      });

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
    } catch (error) {
      this.logger.error('Error durante login de intranet', error, { 
        userId: user.id,
        email: user.email,
        operation: 'loginIntranet'
      });
      throw error;
    }
  }

  // Revocar token (logout)
  async revokeToken(
    userId: string,
    userType: 'client' | 'intranet',
    cookieApp: 'creditoya_token' | 'intranet_token',
    response: Response
  ): Promise<void> {
    this.logger.debug('Iniciando revocación de token', { 
      userId,
      userType,
      cookieApp
    });

    try {
      // Token revocation would need to be implemented differently without Redis
      // Consider using a database table to track revoked tokens or implementing
      // a shorter token expiration with refresh tokens
      
      // Clear cookie
      response.clearCookie(cookieApp, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      });

      this.logger.debug('Token revocado exitosamente', { 
        userId,
        userType,
        cookieApp,
        action: 'logout'
      });
    } catch (error) {
      this.logger.error('Error revocando token', error, { 
        userId,
        userType,
        cookieApp,
        operation: 'revokeToken'
      });
      throw error;
    }
  }

  // Verificar si un token está en la lista negra
  async isTokenRevoked(userId: string, userType: 'client' | 'intranet'): Promise<boolean> {
    this.logger.debug('Verificando si token está revocado', { 
      userId,
      userType
    });

    // Without Redis, you would need to implement this differently
    // For now, assume tokens are always valid (not revoked)
    return false;
  }

  // Hash de contraseñas para registro
  async hashPassword(password: string): Promise<string> {
    this.logger.debug('Generando hash de contraseña');
    
    try {
      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(password, salt);
      
      this.logger.debug('Hash de contraseña generado exitosamente');
      return hashedPassword;
    } catch (error) {
      this.logger.error('Error generando hash de contraseña', error);
      throw error;
    }
  }

  // Obtener perfil de cliente
  async getClientProfile(userId: string) {
    this.logger.debug('Obteniendo perfil de cliente', { userId });

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          LoanApplication: true,
        }
      });

      if (!user) {
        this.logger.warn('Cliente no encontrado al obtener perfil', { userId });
        throw new UnauthorizedException('Usuario no encontrado');
      }

      this.logger.debug('Perfil de cliente obtenido exitosamente', { 
        userId,
        email: user.email,
        userNames: `${user.names} ${user.firstLastName}`,
        loanApplicationsCount: user.LoanApplication?.length || 0
      });

      return { user };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error('Error obteniendo perfil de cliente', error, { 
        userId,
        operation: 'getClientProfile'
      });
      throw error;
    }
  }

  // Obtener perfil de intranet
  async getIntranetProfile(userId: string) {
    this.logger.debug('Obteniendo perfil de usuario intranet', { userId });

    try {
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
          phone: true
          // otros campos que quieras incluir pero NO la contraseña
        }
      });

      if (!user) {
        this.logger.warn('Usuario intranet no encontrado al obtener perfil', { userId });
        throw new UnauthorizedException('Usuario no encontrado');
      }

      this.logger.debug('Perfil de usuario intranet obtenido exitosamente', { 
        userId,
        email: user.email,
        rol: user.rol,
        userName: `${user.name} ${user.lastNames}`,
        isActive: user.isActive
      });

      return { user };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error('Error obteniendo perfil de usuario intranet', error, { 
        userId,
        operation: 'getIntranetProfile'
      });
      throw error;
    }
  }

  async registerClient(data: User) {
    this.logger.debug('Iniciando registro de cliente', {
      email: data.email,
      names: data.names
    });

    // No atrapar el error, dejar que se propague
    const newClient = await this.clientService.create(data);
    this.logger.debug('Cliente registrado exitosamente', {
      userId: newClient.id,
      email: newClient.email,
      userNames: `${newClient.names} ${newClient.firstLastName}`
    });

    // Realizar login automático después del registro
    const loginResult = await this.loginClient(newClient);
    this.logger.debug('Login automático post-registro exitoso', {
      userId: newClient.id,
      email: newClient.email
    });

    return loginResult;
  }

  async registerIntranet(data: any) {
    this.logger.debug('Iniciando registro de usuario intranet', {
      email: data.email,
      name: data.name
    });

    // Verificar si el email ya existe
    const existingUser = await this.prisma.usersIntranet.findUnique({
      where: { email: data.email.trim() },
    });

    if (existingUser) {
      throw new ConflictException('El correo electrónico ya está en uso');
    }

    if (data.password.length < 6) {
      throw new BadRequestException('La contraseña debe tener mínimo 6 caracteres');
    }

    const hashedPassword = await this.hashPassword(data.password);

    const newIntranetUser = await this.prisma.usersIntranet.create({
      data: {
        name: data.name.trim(),
        lastNames: data.lastNames.trim(),
        email: data.email.trim(),
        password: hashedPassword,
        phone: data.phone || 'No definido',
        rol: data.rol || 'No definido',
        isActive: true, // Activar por defecto en registro de desarrollo
        avatar: data.avatar || 'No definido',
      },
    });

    this.logger.debug('Usuario intranet registrado exitosamente', {
      userId: newIntranetUser.id,
      email: newIntranetUser.email,
      userName: `${newIntranetUser.name} ${newIntranetUser.lastNames}`
    });

    // Realizar login automático después del registro
    const loginResult = await this.loginIntranet(newIntranetUser);
    this.logger.debug('Login automático post-registro exitoso', {
      userId: newIntranetUser.id,
      email: newIntranetUser.email
    });

    return loginResult;
  }
}