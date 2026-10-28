import { Inject, Injectable } from '@nestjs/common';
import {
  AccessTokenClaimsSchema,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_CLOCK_TOLERANCE_SECONDS,
  JWT_ISSUER,
} from '@stubb/contracts';
import { jwtVerify, type CryptoKey, type KeyObject } from 'jose';
import type { AuthenticatedUser } from './authenticated-user.js';

export const JWT_PUBLIC_KEY = Symbol('JWT_PUBLIC_KEY');
export type VerificationKey = CryptoKey | KeyObject;

// The read-service only verifies tokens: it holds the public key and never signs.
@Injectable()
export class AccessTokenVerifier {
  constructor(@Inject(JWT_PUBLIC_KEY) private readonly key: VerificationKey) {}

  async verify(token: string): Promise<AuthenticatedUser> {
    const { payload } = await jwtVerify(token, this.key, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: [JWT_ALGORITHM],
      clockTolerance: JWT_CLOCK_TOLERANCE_SECONDS,
    });
    const claims = AccessTokenClaimsSchema.parse(payload);
    return { id: claims.sub, roles: claims.roles };
  }
}
