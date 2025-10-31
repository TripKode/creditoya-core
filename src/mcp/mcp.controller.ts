import { Controller, Post, Body, Get } from '@nestjs/common';
import { McpService } from './mcp.service';
import { BotAuthService } from './bot-auth.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBadRequestResponse,
} from '@nestjs/swagger';

@ApiTags('mcp')
@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcpService: McpService,
    private readonly botAuthService: BotAuthService,
  ) {}

  @Get('tools')
  @ApiOperation({ summary: 'Listar herramientas disponibles en MCP' })
  @ApiResponse({
    status: 200,
    description: 'Lista de herramientas MCP disponibles',
  })
  async listTools() {
    return {
      tools: [
        {
          name: 'send_auth_pin',
          description:
            'Envía un PIN de verificación de 6 dígitos al email del usuario. Verifica si el usuario existe en el sistema antes de enviar el PIN.',
          inputSchema: {
            type: 'object',
            properties: {
              email: {
                type: 'string',
                description: 'Correo electrónico del usuario registrado',
                format: 'email',
              },
            },
            required: ['email'],
          },
        },
        {
          name: 'verify_auth_pin',
          description:
            'Verifica el PIN de 6 dígitos y genera un token JWT de autenticación con duración de 1 día. El PIN debe ser válido y no estar expirado.',
          inputSchema: {
            type: 'object',
            properties: {
              email: {
                type: 'string',
                description: 'Correo electrónico del usuario',
                format: 'email',
              },
              pin: {
                type: 'string',
                description: 'Código PIN de 6 dígitos recibido por email',
                pattern: '^[0-9]{6}$',
              },
            },
            required: ['email', 'pin'],
          },
        },
        {
          name: 'get_client_profile',
          description:
            'Obtiene el perfil completo del cliente autenticado incluyendo sus últimos 5 préstamos. Requiere token JWT válido.',
          inputSchema: {
            type: 'object',
            properties: {
              token: {
                type: 'string',
                description: 'Token JWT de autenticación del cliente',
              },
            },
            required: ['token'],
          },
        },
        {
          name: 'get_latest_loan',
          description:
            'Obtiene el préstamo más reciente del cliente autenticado. Requiere token JWT válido.',
          inputSchema: {
            type: 'object',
            properties: {
              token: {
                type: 'string',
                description: 'Token JWT de autenticación del cliente',
              },
            },
            required: ['token'],
          },
        },
        {
          name: 'get_all_loans',
          description:
            'Obtiene todos los préstamos del cliente autenticado ordenados por fecha de creación. Requiere token JWT válido.',
          inputSchema: {
            type: 'object',
            properties: {
              token: {
                type: 'string',
                description: 'Token JWT de autenticación del cliente',
              },
            },
            required: ['token'],
          },
        },
        {
          name: 'get_loan_details',
          description:
            'Obtiene los detalles completos de un préstamo específico incluyendo eventos y documentos generados. Requiere token JWT válido y que el préstamo pertenezca al cliente.',
          inputSchema: {
            type: 'object',
            properties: {
              token: {
                type: 'string',
                description: 'Token JWT de autenticación del cliente',
              },
              loanId: {
                type: 'string',
                description: 'ID del préstamo a consultar',
              },
            },
            required: ['token', 'loanId'],
          },
        },
        {
          name: 'respond_to_new_amount',
          description:
            'Permite al cliente aceptar o rechazar una oferta de nueva cantidad para su préstamo. Requiere token JWT válido.',
          inputSchema: {
            type: 'object',
            properties: {
              token: {
                type: 'string',
                description: 'Token JWT de autenticación del cliente',
              },
              loanId: {
                type: 'string',
                description: 'ID del préstamo con oferta de nueva cantidad',
              },
              accept: {
                type: 'boolean',
                description: 'true para aceptar la oferta, false para rechazarla',
              },
            },
            required: ['token', 'loanId', 'accept'],
          },
        },
      ],
    };
  }

  @Post('call')
  @ApiOperation({ summary: 'Ejecutar una herramienta MCP' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Nombre de la herramienta',
          enum: [
            'send_auth_pin',
            'verify_auth_pin',
            'get_client_profile',
            'get_latest_loan',
            'get_all_loans',
            'get_loan_details',
            'respond_to_new_amount',
          ],
        },
        arguments: {
          type: 'object',
          description: 'Argumentos de la herramienta',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Herramienta ejecutada exitosamente' })
  @ApiBadRequestResponse({
    description: 'Herramienta desconocida o error en ejecución',
  })
  async callTool(@Body() body: { name: string; arguments: any }) {
    const { name, arguments: args } = body;

    try {
      switch (name) {
        case 'send_auth_pin': {
          if (!args?.email) {
            return {
              error: {
                code: -32602,
                message: 'El parámetro "email" es requerido',
              },
            };
          }
          const result = await this.botAuthService.sendAuthPin(args.email);
          return { result };
        }

        case 'verify_auth_pin': {
          if (!args?.email || !args?.pin) {
            return {
              error: {
                code: -32602,
                message: 'Los parámetros "email" y "pin" son requeridos',
              },
            };
          }
          const result = await this.botAuthService.verifyAuthPin(
            args.email,
            args.pin,
          );
          return { result };
        }

        case 'get_client_profile': {
          if (!args?.token) {
            return {
              error: {
                code: -32602,
                message: 'El parámetro "token" es requerido',
              },
            };
          }
          const result = await this.botAuthService.getClientProfile(args.token);
          return { result };
        }

        case 'get_latest_loan': {
          if (!args?.token) {
            return {
              error: {
                code: -32602,
                message: 'El parámetro "token" es requerido',
              },
            };
          }
          const result = await this.botAuthService.getLatestLoan(args.token);
          return { result };
        }

        case 'get_all_loans': {
          if (!args?.token) {
            return {
              error: {
                code: -32602,
                message: 'El parámetro "token" es requerido',
              },
            };
          }
          const result = await this.botAuthService.getAllLoans(args.token);
          return { result };
        }

        case 'get_loan_details': {
          if (!args?.token || !args?.loanId) {
            return {
              error: {
                code: -32602,
                message: 'Los parámetros "token" y "loanId" son requeridos',
              },
            };
          }
          const result = await this.botAuthService.getLoanDetails(
            args.token,
            args.loanId,
          );
          return { result };
        }

        case 'respond_to_new_amount': {
          if (!args?.token || !args?.loanId || args?.accept === undefined) {
            return {
              error: {
                code: -32602,
                message:
                  'Los parámetros "token", "loanId" y "accept" son requeridos',
              },
            };
          }
          const result = await this.botAuthService.respondToNewAmount(
            args.token,
            args.loanId,
            args.accept,
          );
          return { result };
        }

        default:
          return {
            error: {
              code: -32601,
              message: `Herramienta desconocida: ${name}`,
            },
          };
      }
    } catch (error) {
      return {
        error: {
          code: -32603,
          message: `Error ejecutando herramienta ${name}: ${error.message}`,
        },
      };
    }
  }

  // Endpoints directos para las herramientas (más fácil de probar)
  @Post('bot/send-pin')
  @ApiOperation({
    summary: 'Enviar PIN de verificación para autenticación del bot',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          format: 'email',
          description: 'Correo electrónico del usuario',
        },
      },
      required: ['email'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'PIN enviado exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        userExists: { type: 'boolean' },
        pinSent: { type: 'boolean' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Usuario no encontrado o cuenta suspendida' })
  async sendBotPin(@Body() body: { email: string }) {
    return await this.botAuthService.sendAuthPin(body.email);
  }

  @Post('bot/verify-pin')
  @ApiOperation({
    summary: 'Verificar PIN y obtener token de autenticación para el bot',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          format: 'email',
          description: 'Correo electrónico del usuario',
        },
        pin: {
          type: 'string',
          pattern: '^[0-9]{6}$',
          description: 'Código PIN de 6 dígitos',
        },
      },
      required: ['email', 'pin'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Autenticación exitosa',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        accessToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            names: { type: 'string' },
            firstLastName: { type: 'string' },
            secondLastName: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'PIN incorrecto, expirado o usuario no encontrado',
  })
  async verifyBotPin(@Body() body: { email: string; pin: string }) {
    return await this.botAuthService.verifyAuthPin(body.email, body.pin);
  }

  @Post('bot/profile')
  @ApiOperation({ summary: 'Obtener perfil del cliente (requiere token)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token JWT del cliente' },
      },
      required: ['token'],
    },
  })
  @ApiResponse({ status: 200, description: 'Perfil obtenido exitosamente' })
  @ApiBadRequestResponse({ description: 'Token inválido o expirado' })
  async getBotProfile(@Body() body: { token: string }) {
    return await this.botAuthService.getClientProfile(body.token);
  }

  @Post('bot/latest-loan')
  @ApiOperation({ summary: 'Obtener último préstamo del cliente (requiere token)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token JWT del cliente' },
      },
      required: ['token'],
    },
  })
  @ApiResponse({ status: 200, description: 'Préstamo obtenido exitosamente' })
  @ApiBadRequestResponse({ description: 'Token inválido o expirado' })
  async getBotLatestLoan(@Body() body: { token: string }) {
    return await this.botAuthService.getLatestLoan(body.token);
  }

  @Post('bot/all-loans')
  @ApiOperation({
    summary: 'Obtener todos los préstamos del cliente (requiere token)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token JWT del cliente' },
      },
      required: ['token'],
    },
  })
  @ApiResponse({ status: 200, description: 'Préstamos obtenidos exitosamente' })
  @ApiBadRequestResponse({ description: 'Token inválido o expirado' })
  async getBotAllLoans(@Body() body: { token: string }) {
    return await this.botAuthService.getAllLoans(body.token);
  }

  @Post('bot/loan-details')
  @ApiOperation({
    summary: 'Obtener detalles de un préstamo específico (requiere token)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token JWT del cliente' },
        loanId: { type: 'string', description: 'ID del préstamo' },
      },
      required: ['token', 'loanId'],
    },
  })
  @ApiResponse({ status: 200, description: 'Detalles obtenidos exitosamente' })
  @ApiBadRequestResponse({
    description: 'Token inválido, préstamo no encontrado o no autorizado',
  })
  async getBotLoanDetails(@Body() body: { token: string; loanId: string }) {
    return await this.botAuthService.getLoanDetails(body.token, body.loanId);
  }

  @Post('bot/respond-new-amount')
  @ApiOperation({
    summary: 'Responder a oferta de nueva cantidad (requiere token)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token JWT del cliente' },
        loanId: { type: 'string', description: 'ID del préstamo' },
        accept: {
          type: 'boolean',
          description: 'true para aceptar, false para rechazar',
        },
      },
      required: ['token', 'loanId', 'accept'],
    },
  })
  @ApiResponse({ status: 200, description: 'Respuesta registrada exitosamente' })
  @ApiBadRequestResponse({
    description: 'Token inválido, préstamo no encontrado o sin oferta de nueva cantidad',
  })
  async respondBotNewAmount(
    @Body() body: { token: string; loanId: string; accept: boolean },
  ) {
    return await this.botAuthService.respondToNewAmount(
      body.token,
      body.loanId,
      body.accept,
    );
  }
}
