import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@stubb/contracts';
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

// Default-deny: toda rota exige token, salvo as marcadas com @Public().
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Exige ao menos um dos papéis listados.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export type RequestWithUser = Request & { user?: AuthenticatedUser };

export function extractCurrentUser(_data: unknown, context: ExecutionContext): AuthenticatedUser {
  const user = context.switchToHttp().getRequest<RequestWithUser>().user;
  if (!user) throw new Error('CurrentUser used on a route without authentication');
  return user;
}

export const CurrentUser = createParamDecorator(extractCurrentUser);
