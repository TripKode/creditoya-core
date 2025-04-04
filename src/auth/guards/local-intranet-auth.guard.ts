import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalIntranetAuthGuard extends AuthGuard('local-intranet') {}