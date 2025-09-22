import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class DevGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return process.env.NODE_ENV === 'development';
  }
}