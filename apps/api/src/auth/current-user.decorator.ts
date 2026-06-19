import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from './auth.guard.js';

/** Inietta il payload JWT dell'utente autenticato nel parametro del controller. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload =>
    ctx.switchToHttp().getRequest().user,
);
