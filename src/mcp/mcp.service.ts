import { Injectable } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';

@Injectable()
export class McpService {
  private server: Server;

  constructor() {
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
          // Herramientas personalizadas
        ],
      };
    });

    // Handler para ejecutar herramientas
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Aquí puedes agregar la lógica para ejecutar tus herramientas personalizadas
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Herramienta desconocida: ${name}`
        );
      } catch (error) {
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
