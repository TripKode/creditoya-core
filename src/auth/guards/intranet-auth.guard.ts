import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class IntranetAuthGuard extends AuthGuard('jwt-intranet') {}