import { Injectable } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { BotAuthService } from './bot-auth.service';

@Injectable()
export class McpService {
  private server: Server;

  constructor(private botAuthService: BotAuthService) {
    this.server = new Server(
      {
        name: 'creditoya-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // Handler para listar herramientas
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'send_auth_pin',
            description: 'Envía un PIN de verificación de 6 dígitos al email del usuario. Verifica si el usuario existe en el sistema antes de enviar el PIN.',
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
            description: 'Verifica el PIN de 6 dígitos y genera un token JWT de autenticación con duración de 1 día. El PIN debe ser válido y no estar expirado.',
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
            description: 'Obtiene el perfil completo del cliente autenticado incluyendo sus últimos 5 préstamos. Requiere token JWT válido.',
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
            description: 'Obtiene el préstamo más reciente del cliente autenticado. Requiere token JWT válido.',
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
            description: 'Obtiene todos los préstamos del cliente autenticado ordenados por fecha de creación. Requiere token JWT válido.',
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
            description: 'Obtiene los detalles completos de un préstamo específico incluyendo eventos y documentos generados. Requiere token JWT válido y que el préstamo pertenezca al cliente.',
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
            description: 'Permite al cliente aceptar o rechazar una oferta de nueva cantidad para su préstamo. Requiere token JWT válido.',
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
    });

    // Handler para ejecutar herramientas
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'send_auth_pin': {
            if (!args || typeof args !== 'object' || !('email' in args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'El parámetro "email" es requerido'
              );
            }

            const email = args.email as string;
            const result = await this.botAuthService.sendAuthPin(email);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'verify_auth_pin': {
            if (!args || typeof args !== 'object' || !('email' in args) || !('pin' in args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'Los parámetros "email" y "pin" son requeridos'
              );
            }

            const email = args.email as string;
            const pin = args.pin as string;
            const result = await this.botAuthService.verifyAuthPin(email, pin);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_client_profile': {
            if (!args || typeof args !== 'object' || !('token' in args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'El parámetro "token" es requerido'
              );
            }

            const token = args.token as string;
            const result = await this.botAuthService.getClientProfile(token);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_latest_loan': {
            if (!args || typeof args !== 'object' || !('token' in args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'El parámetro "token" es requerido'
              );
            }

            const token = args.token as string;
            const result = await this.botAuthService.getLatestLoan(token);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_all_loans': {
            if (!args || typeof args !== 'object' || !('token' in args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'El parámetro "token" es requerido'
              );
            }

            const token = args.token as string;
            const result = await this.botAuthService.getAllLoans(token);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_loan_details': {
            if (!args || typeof args !== 'object' || !('token' in args) || !('loanId' in args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'Los parámetros "token" y "loanId" son requeridos'
              );
            }

            const token = args.token as string;
            const loanId = args.loanId as string;
            const result = await this.botAuthService.getLoanDetails(token, loanId);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'respond_to_new_amount': {
            if (!args || typeof args !== 'object' || !('token' in args) || !('loanId' in args) || !('accept' in args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                'Los parámetros "token", "loanId" y "accept" son requeridos'
              );
            }

            const token = args.token as string;
            const loanId = args.loanId as string;
            const accept = args.accept as boolean;
            const result = await this.botAuthService.respondToNewAmount(token, loanId, accept);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Herramienta desconocida: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Error ejecutando herramienta ${name}: ${error.message}`
        );
      }
    });
  }


  async startServer() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Servidor MCP iniciado');
  }

  getServer() {
    return this.server;
  }
}
