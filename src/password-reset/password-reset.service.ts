import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { MailService } from 'src/mail/mail.service';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class PasswordResetService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private emailService: MailService,
  ) { }

  /**
   * Genera un magic link para recuperación de contraseña
   * @param email Email del usuario
   * @param userType Tipo de usuario ("client" o "intranet")
   * @returns Objeto con la URL del magic link
   */
  async generateMagicLink(email: string, userType: 'client' | 'intranet'): Promise<{ magicLink: string }> {
    // Verificar si el usuario existe
    const user = userType === 'client'
      ? await this.prisma.user.findUnique({ where: { email } })
      : await this.prisma.usersIntranet.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Generar un token único
    const resetToken = uuidv4();

    // Calcular fecha de expiración (10 minutos)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Guardar el token en la base de datos
    await this.prisma.passwordReset.create({
      data: {
        email,
        token: resetToken,
        userType,
        expiresAt,
        isUsed: false,
      },
    });

    // Construir el magic link
    const baseUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    const magicLink = `${baseUrl}/reset-password?token=${resetToken}&type=${userType}`;

    // Enviar correo con el magic link
    await this.emailService.sendPasswordResetEmail(email, magicLink, userType);

    return { magicLink };
  }

  /**
   * Valida un token de recuperación de contraseña
   * @param token Token de recuperación
   * @returns Objeto con información del token
   */
  async validateResetToken(token: string): Promise<{ email: string, userType: string }> {
    // Buscar el token en la base de datos
    const resetRecord = await this.prisma.passwordReset.findUnique({
      where: { token },
    });

    if (!resetRecord) {
      throw new NotFoundException('Token de recuperación no válido');
    }

    // Verificar si el token ha expirado
    if (new Date() > resetRecord.expiresAt) {
      throw new BadRequestException('El token de recuperación ha expirado');
    }

    // Verificar si el token ya ha sido utilizado
    if (resetRecord.isUsed) {
      throw new BadRequestException('Este token ya ha sido utilizado');
    }

    return {
      email: resetRecord.email,
      userType: resetRecord.userType,
    };
  }

  /**
   * Restablece la contraseña utilizando un token de recuperación
   * @param token Token de recuperación
   * @param newPassword Nueva contraseña
   * @returns Objeto con mensaje de éxito
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    // Validar el token primero
    const { email, userType } = await this.validateResetToken(token);

    // Hashear la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar la contraseña en la base de datos según el tipo de usuario
    if (userType === 'client') {
      await this.prisma.user.update({
        where: { email },
        data: { password: hashedPassword },
      });
    } else if (userType === 'intranet') {
      await this.prisma.usersIntranet.update({
        where: { email },
        data: { password: hashedPassword },
      });
    } else {
      throw new BadRequestException('Tipo de usuario no válido');
    }

    // Marcar el token como utilizado
    await this.prisma.passwordReset.update({
      where: { token },
      data: { isUsed: true },
    });

    return { message: 'Contraseña restablecida con éxito' };
  }

  /**
   * Limpia los tokens expirados y utilizados de la base de datos
   * Esta función se ejecuta automáticamente cada hora
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredTokens(): Promise<void> {
    await this.prisma.passwordReset.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { isUsed: true }
        ]
      }
    });
  }
}