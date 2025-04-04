import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Obtener los roles requeridos para la ruta
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si no hay roles requeridos, permitir acceso
    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    
    // Verificar si el usuario existe y tiene rol
    if (!user || !user.rol) {
      throw new ForbiddenException('No tienes permiso para acceder a este recurso');
    }

    // Comprobar si el rol del usuario coincide con alguno de los roles requeridos
    // Si 'client' está en los roles requeridos y el usuario es cliente, permitir acceso
    if (requiredRoles.includes('client') && user.rol === 'client') {
      return true;
    }
    
    // Si 'admin' o 'employee' están en los roles requeridos y el usuario tiene ese rol, permitir acceso
    return requiredRoles.includes(user.rol);
  }
}