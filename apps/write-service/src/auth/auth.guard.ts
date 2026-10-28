import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@stubb/contracts';
import { AccessTokenVerifier } from './access-token.verifier.js';
import { IS_PUBLIC_KEY, ROLES_KEY, type RequestWithUser } from './decorators.js';

const unauthenticated = () =>
  new UnauthorizedException({
    statusCode: 401,
    error: 'Unauthorized',
    message: 'Authentication required',
    code: 'UNAUTHENTICATED',
  });

const forbidden = () =>
  new ForbiddenException({
    statusCode: 403,
    error: 'Forbidden',
    message: 'Insufficient role',
    code: 'FORBIDDEN',
  });

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: AccessTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    // Em rota pública o token é ignorado.
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    const match = header ? /^Bearer (\S+)$/.exec(header) : null;
    if (!match?.[1]) throw unauthenticated();

    let user;
    try {
      user = await this.verifier.verify(match[1]);
    } catch {
      throw unauthenticated();
    }

    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets);
    if (required && required.length > 0 && !required.some((role) => user.roles.includes(role))) {
      throw forbidden();
    }
    request.user = user;
    return true;
  }
}
