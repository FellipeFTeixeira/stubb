import { Inject, Injectable } from '@nestjs/common';
import {
  AccessTokenClaimsSchema,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_CLOCK_TOLERANCE_SECONDS,
  JWT_ISSUER,
} from '@stubb/contracts';
import { jwtVerify } from 'jose';
import type { AuthenticatedUser } from './authenticated-user.js';
import { JWT_KEYS, type JwtKeys } from './jwt-keys.js';

@Injectable()
export class AccessTokenVerifier {
  constructor(@Inject(JWT_KEYS) private readonly keys: JwtKeys) {}

  // Lança em assinatura inválida, token vencido ou claims fora do contrato.
  async verify(token: string): Promise<AuthenticatedUser> {
    const { payload } = await jwtVerify(token, this.keys.publicKey, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: [JWT_ALGORITHM],
      clockTolerance: JWT_CLOCK_TOLERANCE_SECONDS,
    });
    const claims = AccessTokenClaimsSchema.parse(payload);
    return { id: claims.sub, roles: claims.roles };
  }
}
