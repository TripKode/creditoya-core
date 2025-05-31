import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { DevService } from './dev.service';
import { CreateDevDto } from './dto/create-dev.dto';
import { UpdateDevDto } from './dto/update-dev.dto';

@Controller('dev')
export class DevController {
  constructor(private readonly devService: DevService) { }

  /**
   * Endpoint para limpiar campos problemáticos
   * ⚠️ CUIDADO: Esta operación es irreversible
   */
  @Post('cleanup-user-fields')
  async cleanupUserFields() {
    try {
      const result = await this.devService.cleanupUserFields();

      return {
        success: result.success,
        message: result.message,
        data: {
          affectedUsers: result.affectedUsers,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error ejecutando limpieza',
        error: error.message
      };
    }
  }

  /**
   * Endpoint para limpieza paso a paso (más detallada)
   */
  @Post('cleanup-user-fields-detailed')
  async cleanupUserFieldsDetailed() {
    try {
      const result = await this.devService.cleanupUserFieldsStepByStep();

      return {
        success: result.success,
        message: result.success ? 'Limpieza completada' : 'Limpieza con errores',
        data: {
          details: result.details,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error ejecutando limpieza detallada',
        error: error.message
      };
    }
  }

  /**
   * Endpoint para verificar el estado de los campos antes/después de la limpieza
   */
  @Get('verify-user-fields-status')
  async verifyUserFieldsStatus() {
    try {
      const status = await this.devService.verifyUserFieldsStatus();

      return {
        success: true,
        message: 'Estado de campos verificado',
        data: status
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error verificando estado',
        error: error.message
      };
    }
  }

  /**
   * Endpoint para limpiar campos problemáticos con valores null en User
   * ⚠️ CUIDADO: Esta operación es irreversible
   */
  @Post('cleanup-deep-user-fields')
  async cleanupDeepUserFields() {
    try {
      const result = await this.devService.fixUserNullFields();

      return {
        success: result.success,
        message: result.message,
        data: {
          affectedUsers: result.details?.affectedUsers || 0,
          remainingNullFields: result.details?.remainingNullFields || 0,
          details: result.details,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error ejecutando limpieza profunda',
        error: error.message,
        data: {
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
     * Endpoint para convertir campos phone de string a string[]
     * ⚠️ CUIDADO: Esta operación modifica datos existentes
     */
  @Post('convert-phone-fields')
  async convertPhoneFields() {
    try {
      const result = await this.devService.convertPhoneFields();

      return {
        success: result.success,
        message: result.message,
        data: {
          details: result.details,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error ejecutando conversión de campos phone',
        error: error.message
      };
    }
  }

  /**
   * Endpoint para verificar el estado de los campos phone
   * Útil para revisar antes y después de la conversión
   */
  @Get('verify-phone-fields-status')
  async verifyPhoneFieldsStatus() {
    try {
      const status = await this.devService.verifyPhoneFieldsStatus();

      return {
        success: true,
        message: 'Estado de campos phone verificado',
        data: status
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error verificando estado de campos phone',
        error: error.message
      };
    }
  }
}
