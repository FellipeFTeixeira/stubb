import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { importSPKI } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { AccessTokenVerifier } from '../../../src/auth/access-token.verifier.js';
import { AuthGuard } from '../../../src/auth/auth.guard.js';
import { Public, Roles } from '../../../src/auth/decorators.js';
import { publicKeyPem, signTestToken } from '../../support/auth.js';

const SUB = '0193a4f0-0000-7000-8000-000000000001';

class Plain {
  open(): void {}
}
class OpenController {
  @Public()
  open(): void {}
}
class OrganizerController {
  @Roles('organizer')
  restricted(): void {}
  anyRole(): void {}
}

function contextOf(
  target: new () => object,
  method: string,
  authorization?: string,
): { context: ExecutionContext; request: { headers: Record<string, string>; user?: unknown } } {
  const request: { headers: Record<string, string>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  const handler = (target.prototype as Record<string, () => void>)[method];
  const context = {
    getHandler: () => handler,
    getClass: () => target,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('AuthGuard', () => {
  let guard: AuthGuard;
  beforeAll(async () => {
    const verifier = new AccessTokenVerifier(await importSPKI(publicKeyPem, 'EdDSA'));
    guard = new AuthGuard(new Reflector(), verifier);
  });

  it('lets a @Public route through without a token, even with a bad one', async () => {
    await expect(guard.canActivate(contextOf(OpenController, 'open').context)).resolves.toBe(true);
    await expect(
      guard.canActivate(contextOf(OpenController, 'open', 'Bearer garbage').context),
    ).resolves.toBe(true);
  });

  it('answers 401 UNAUTHENTICATED without header (default-deny)', async () => {
    const error: unknown = await guard
      .canActivate(contextOf(Plain, 'open').context)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      code: 'UNAUTHENTICATED',
    });
  });

  it.each(['Basic abc', 'Bearer', 'Bearer a b', 'Bearer not-a-jwt'])(
    'answers 401 for the malformed or invalid header %j',
    async (header) => {
      await expect(
        guard.canActivate(contextOf(Plain, 'open', header).context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('answers 403 FORBIDDEN when the role is missing', async () => {
    const token = await signTestToken({ sub: SUB, roles: ['customer'] });
    const error: unknown = await guard
      .canActivate(contextOf(OrganizerController, 'restricted', `Bearer ${token}`).context)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
      code: 'FORBIDDEN',
    });
  });

  it('accepts the required role and exposes the user', async () => {
    const token = await signTestToken({ sub: SUB, roles: ['customer', 'organizer'] });
    const { context, request } = contextOf(OrganizerController, 'restricted', `Bearer ${token}`);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: SUB, roles: ['customer', 'organizer'] });
  });

  it('accepts any valid token on a route without @Roles', async () => {
    const token = await signTestToken({ sub: SUB, roles: ['customer'] });
    await expect(
      guard.canActivate(contextOf(OrganizerController, 'anyRole', `Bearer ${token}`).context),
    ).resolves.toBe(true);
  });
});
