import { Controller, Post, Body, Get } from '@nestjs/common';
import { McpService } from './mcp.service';

@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('tools')
  async listTools() {
    const server = this.mcpService.getServer();
    // Para HTTP, necesitamos adaptar el manejo de MCP
    // Esto es un endpoint básico para listar herramientas
    return {
      tools: [
        // Aquí puedes agregar tus herramientas personalizadas
      ],
    };
  }

  @Post('call')
  async callTool(@Body() body: { name: string; arguments: any }) {
    const { name, arguments: args } = body;

    try {
      // Aquí puedes agregar la lógica para ejecutar tus herramientas personalizadas
      return {
        error: {
          code: -32601,
          message: `Herramienta desconocida: ${name}`,
        },
      };
    } catch (error) {
      return {
        error: {
          code: -32603,
          message: `Error ejecutando herramienta ${name}: ${error.message}`,
        },
      };
    }
  }

}
