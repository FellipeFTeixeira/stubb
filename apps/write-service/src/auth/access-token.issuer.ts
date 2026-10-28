import { Inject, Injectable } from '@nestjs/common';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from '@stubb/contracts';
import { SignJWT } from 'jose';
import { Clock } from '../shared/clock/clock.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { JWT_KEYS, type JwtKeys } from './jwt-keys.js';

@Injectable()
export class AccessTokenIssuer {
  constructor(
    @Inject(JWT_KEYS) private readonly keys: JwtKeys,
    private readonly clock: Clock,
  ) {}

  // O token carrega só `sub` e `roles`: nunca CPF nem e-mail (RN-27).
  async issue(user: AuthenticatedUser): Promise<{ accessToken: string; expiresIn: number }> {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const accessToken = await new SignJWT({ roles: user.roles })
      .setProtectedHeader({ alg: JWT_ALGORITHM })
      .setSubject(user.id)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + ACCESS_TOKEN_TTL_SECONDS)
      .sign(this.keys.privateKey);
    return { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }
}
