import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@stubb/contracts';
import { AccessTokenVerifier } from './access-token.verifier.js';
import { type AuthenticatedRequest, IS_PUBLIC_KEY, ROLES_KEY } from './decorators.js';

const BEARER = /^Bearer (\S+)$/i;

function unauthenticated(): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: 401,
    error: 'Unauthorized',
    message: 'Authentication required',
    code: 'UNAUTHENTICATED',
  });
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccessTokenVerifier) private readonly verifier: AccessTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    // On a public route the token is ignored, even a bad one.
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = BEARER.exec(request.headers.authorization ?? '');
    if (!match?.[1]) throw unauthenticated();

    let user;
    try {
      user = await this.verifier.verify(match[1]);
    } catch {
      throw unauthenticated();
    }

    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets);
    if (required?.length && !required.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Insufficient role',
        code: 'FORBIDDEN',
      });
    }
    request.user = user;
    return true;
  }
}
