import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class BotAuthService {
  private readonly logger = new Logger(BotAuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  // Generar PIN de 6 dígitos
  private generatePin(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Tool MCP 1: Enviar PIN de verificación por email
   * Verifica si existe el usuario y envía un PIN de 6 dígitos
   */
  async sendAuthPin(email: string): Promise<{
    success: boolean;
    message: string;
    userExists: boolean;
    pinSent: boolean;
  }> {
    this.logger.debug('Enviando PIN de autenticación para bot', { email });

    try {
      // Verificar si el usuario existe en la tabla User
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        this.logger.warn('Usuario no encontrado para autenticación de bot', { email });
        return {
          success: false,
          message: 'Usuario no encontrado. Debe registrarse primero.',
          userExists: false,
          pinSent: false,
        };
      }

      // Verificar si está baneado
      if (user.isBan) {
        this.logger.warn('Intento de autenticación de usuario suspendido', {
          email,
          userId: user.id,
        });
        throw new BadRequestException('Su cuenta ha sido suspendida');
      }

      // Generar PIN
      const pin = this.generatePin();
      const pinExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

      // Crear o actualizar registro en BotUser
      await this.prisma.botUser.upsert({
        where: { email },
        update: {
          pin,
          pinExpiry,
          lastPinSentAt: new Date(),
          userId: user.id,
        },
        create: {
          email,
          pin,
          pinExpiry,
          lastPinSentAt: new Date(),
          userId: user.id,
          isActive: true,
        },
      });

      // Enviar email con el PIN
      await this.mailService.sendCustomEmail({
        email: user.email,
        subject: 'Código de autenticación - Bot CreditoYa',
        message: `Hola ${user.names},\n\nSu código de autenticación para el bot de CreditoYa es: ${pin}\n\nEste código expira en 10 minutos.\n\nSi no solicitó este código, ignore este mensaje.`,
        files: [],
      });

      this.logger.debug('PIN de autenticación enviado exitosamente para bot', {
        userId: user.id,
        email: user.email,
        pinExpiry: pinExpiry.toISOString(),
      });

      return {
        success: true,
        message: 'Código de autenticación enviado a su correo electrónico',
        userExists: true,
        pinSent: true,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error('Error enviando PIN de autenticación para bot', error, {
        email,
        operation: 'sendAuthPin',
      });
      throw new BadRequestException('Error enviando el código de autenticación');
    }
  }

  /**
   * Tool MCP 2: Verificar PIN y generar token de 1 día
   * Verifica el PIN y genera un JWT con duración de 1 día
   */
  async verifyAuthPin(email: string, pin: string): Promise<{
    success: boolean;
    message: string;
    accessToken?: string;
    user?: {
      id: string;
      email: string;
      names: string;
      firstLastName: string;
      secondLastName: string;
    };
  }> {
    this.logger.debug('Verificando PIN de autenticación para bot', { email });

    try {
      // Buscar BotUser con el email
      const botUser = await this.prisma.botUser.findUnique({
        where: { email },
      });

      if (!botUser) {
        this.logger.warn('BotUser no encontrado', { email });
        throw new BadRequestException(
          'No se encontró solicitud de autenticación. Debe solicitar un código primero.',
        );
      }

      // Verificar si el PIN existe
      if (!botUser.pin) {
        this.logger.warn('No hay PIN almacenado para este BotUser', { email });
        throw new BadRequestException('Debe solicitar un código de autenticación primero');
      }

      // Verificar PIN
      if (botUser.pin !== pin) {
        this.logger.warn('PIN incorrecto para bot', { email });
        throw new BadRequestException('Código de autenticación incorrecto');
      }

      // Verificar expiración
      if (botUser.pinExpiry && botUser.pinExpiry < new Date()) {
        this.logger.warn('PIN expirado para bot', { email });
        // Limpiar PIN expirado
        await this.prisma.botUser.update({
          where: { email },
          data: { pin: null, pinExpiry: null },
        });
        throw new BadRequestException('Código de autenticación expirado');
      }

      // Buscar usuario en tabla User
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        this.logger.warn('Usuario no encontrado al verificar PIN', { email });
        throw new BadRequestException('Usuario no encontrado');
      }

      // Verificar si está baneado
      if (user.isBan) {
        this.logger.warn('Intento de autenticación de usuario suspendido', {
          email,
          userId: user.id,
        });
        throw new BadRequestException('Su cuenta ha sido suspendida');
      }

      // Limpiar PIN usado
      await this.prisma.botUser.update({
        where: { email },
        data: { pin: null, pinExpiry: null },
      });

      // Generar token JWT con duración de 1 día
      const payload = {
        sub: user.id,
        email: user.email,
        type: 'client',
        source: 'bot', // Identificar que viene del bot
      };

      const token = this.jwtService.sign(payload, {
        expiresIn: '1d', // 1 día de duración
      });

      this.logger.debug('PIN verificado y token generado para bot', {
        userId: user.id,
        email: user.email,
        tokenExpiry: '1 día',
      });

      return {
        success: true,
        message: 'Autenticación exitosa',
        accessToken: token,
        user: {
          id: user.id,
          email: user.email,
          names: user.names,
          firstLastName: user.firstLastName,
          secondLastName: user.secondLastName,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error('Error verificando PIN de autenticación para bot', error, {
        email,
        operation: 'verifyAuthPin',
      });
      throw new BadRequestException('Error verificando el código de autenticación');
    }
  }

  /**
   * Tool MCP 3: Obtener perfil del cliente autenticado
   * Requiere JWT token válido en el parámetro
   */
  async getClientProfile(token: string): Promise<{
    success: boolean;
    user?: any;
    message?: string;
  }> {
    this.logger.debug('Obteniendo perfil de cliente para bot');

    try {
      // Verificar y decodificar el token
      const decoded = this.jwtService.verify(token);

      if (decoded.type !== 'client') {
        throw new BadRequestException('El token no corresponde a un cliente');
      }

      // Obtener perfil del cliente
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
        include: {
          LoanApplication: {
            orderBy: { created_at: 'desc' },
            take: 5, // Últimos 5 préstamos
          },
        },
      });

      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      // Remover información sensible
      const { password, ...userWithoutPassword } = user;

      this.logger.debug('Perfil de cliente obtenido exitosamente', {
        userId: user.id,
        email: user.email,
      });

      return {
        success: true,
        user: userWithoutPassword,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      this.logger.error('Error obteniendo perfil de cliente', error);
      throw new BadRequestException('Error obteniendo el perfil del cliente');
    }
  }

  /**
   * Tool MCP 4: Obtener el último préstamo del cliente
   */
  async getLatestLoan(token: string): Promise<{
    success: boolean;
    loan?: any;
    message?: string;
  }> {
    this.logger.debug('Obteniendo último préstamo del cliente');

    try {
      const decoded = this.jwtService.verify(token);

      if (decoded.type !== 'client') {
        throw new BadRequestException('El token no corresponde a un cliente');
      }

      const loan = await this.prisma.loanApplication.findFirst({
        where: { userId: decoded.sub },
        orderBy: { created_at: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              names: true,
              firstLastName: true,
              secondLastName: true,
            },
          },
        },
      });

      if (!loan) {
        return {
          success: true,
          message: 'No se encontraron préstamos para este usuario',
          loan: null,
        };
      }

      this.logger.debug('Último préstamo obtenido exitosamente', {
        loanId: loan.id,
        userId: decoded.sub,
      });

      return {
        success: true,
        loan,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error('Error obteniendo último préstamo', error);
      throw new BadRequestException('Error obteniendo el último préstamo');
    }
  }

  /**
   * Tool MCP 5: Obtener todos los préstamos del cliente
   */
  async getAllLoans(token: string): Promise<{
    success: boolean;
    loans?: any[];
    total?: number;
    message?: string;
  }> {
    this.logger.debug('Obteniendo todos los préstamos del cliente');

    try {
      const decoded = this.jwtService.verify(token);

      if (decoded.type !== 'client') {
        throw new BadRequestException('El token no corresponde a un cliente');
      }

      const loans = await this.prisma.loanApplication.findMany({
        where: { userId: decoded.sub },
        orderBy: { created_at: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              names: true,
              firstLastName: true,
              secondLastName: true,
            },
          },
        },
      });

      this.logger.debug('Préstamos obtenidos exitosamente', {
        userId: decoded.sub,
        total: loans.length,
      });

      return {
        success: true,
        loans,
        total: loans.length,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error('Error obteniendo préstamos', error);
      throw new BadRequestException('Error obteniendo los préstamos');
    }
  }

  /**
   * Tool MCP 6: Obtener detalles de un préstamo específico
   */
  async getLoanDetails(
    token: string,
    loanId: string,
  ): Promise<{
    success: boolean;
    loan?: any;
    message?: string;
  }> {
    this.logger.debug('Obteniendo detalles de préstamo', { loanId });

    try {
      const decoded = this.jwtService.verify(token);

      if (decoded.type !== 'client') {
        throw new BadRequestException('El token no corresponde a un cliente');
      }

      const loan = await this.prisma.loanApplication.findFirst({
        where: {
          id: loanId,
          userId: decoded.sub, // Solo puede ver sus propios préstamos
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              names: true,
              firstLastName: true,
              secondLastName: true,
            },
          },
          EventLoanApplication: {
            orderBy: { created_at: 'desc' },
          },
          GeneratedDocuments: true,
        },
      });

      if (!loan) {
        throw new NotFoundException('Préstamo no encontrado o no autorizado');
      }

      this.logger.debug('Detalles de préstamo obtenidos exitosamente', {
        loanId,
        userId: decoded.sub,
      });

      return {
        success: true,
        loan,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      this.logger.error('Error obteniendo detalles de préstamo', error, {
        loanId,
      });
      throw new BadRequestException('Error obteniendo detalles del préstamo');
    }
  }

  /**
   * Tool MCP 7: Responder a oferta de nueva cantidad
   */
  async respondToNewAmount(
    token: string,
    loanId: string,
    accept: boolean,
  ): Promise<{
    success: boolean;
    message: string;
    loan?: any;
  }> {
    this.logger.debug('Respondiendo a oferta de nueva cantidad', {
      loanId,
      accept,
    });

    try {
      const decoded = this.jwtService.verify(token);

      if (decoded.type !== 'client') {
        throw new BadRequestException('El token no corresponde a un cliente');
      }

      // Verificar que el préstamo pertenece al cliente
      const loan = await this.prisma.loanApplication.findFirst({
        where: {
          id: loanId,
          userId: decoded.sub,
        },
      });

      if (!loan) {
        throw new NotFoundException('Préstamo no encontrado o no autorizado');
      }

      // Verificar que hay una nueva cantidad definida
      if (!loan.newCantity) {
        throw new BadRequestException(
          'No hay una oferta de nueva cantidad para este préstamo',
        );
      }

      // Actualizar el préstamo
      const updatedLoan = await this.prisma.loanApplication.update({
        where: { id: loanId },
        data: {
          newCantityOpt: accept,
          status: accept ? 'Aprobado' : 'Archivado',
        },
      });

      // Marcar evento como respondido si existe
      await this.prisma.eventLoanApplication.updateMany({
        where: {
          loanId,
          type: 'CHANGE_CANTITY',
          isAnswered: false,
        },
        data: {
          isAnswered: true,
        },
      });

      this.logger.debug('Respuesta a nueva cantidad registrada', {
        loanId,
        accept,
        userId: decoded.sub,
      });

      return {
        success: true,
        message: accept
          ? 'Oferta aceptada exitosamente'
          : 'Oferta rechazada exitosamente',
        loan: updatedLoan,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      this.logger.error('Error respondiendo a nueva cantidad', error, {
        loanId,
      });
      throw new BadRequestException('Error procesando la respuesta');
    }
  }
}
