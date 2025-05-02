import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ClientAuthGuard } from './client-auth.guard';
import { IntranetAuthGuard } from './intranet-auth.guard';

@Injectable()
export class CombinedAuthGuard implements CanActivate {
  constructor(
    private clientGuard: ClientAuthGuard,
    private intranetGuard: IntranetAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // Intenta autenticar como cliente
      const isClient = await this.clientGuard.canActivate(context);
      if (isClient) return true;
    } catch (error) {
      // Si falla, continúa al siguiente guard
    }

    try {
      // Intenta autenticar como intranet
      const isIntranet = await this.intranetGuard.canActivate(context);
      if (isIntranet) return true;
    } catch (error) {
      // Si falla, continúa
    }

    // Si ambos fallan, deniega el acceso
    return false;
  }
}