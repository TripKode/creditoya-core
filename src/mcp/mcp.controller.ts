import { Controller, Post, Body, Get } from '@nestjs/common';
import { McpService } from './mcp.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBadRequestResponse
} from '@nestjs/swagger';

@ApiTags('mcp')
@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('tools')
  @ApiOperation({ summary: 'Listar herramientas disponibles en MCP' })
  @ApiResponse({ status: 200, description: 'Lista de herramientas MCP disponibles' })
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
  @ApiOperation({ summary: 'Ejecutar una herramienta MCP' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre de la herramienta' },
        arguments: { type: 'object', description: 'Argumentos de la herramienta' }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Herramienta ejecutada exitosamente' })
  @ApiBadRequestResponse({ description: 'Herramienta desconocida o error en ejecución' })
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
