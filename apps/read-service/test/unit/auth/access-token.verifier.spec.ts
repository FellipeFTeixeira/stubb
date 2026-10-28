import { generateKeyPairSync } from 'node:crypto';
import { JWT_AUDIENCE, JWT_ISSUER } from '@stubb/contracts';
import { importPKCS8, importSPKI, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { AccessTokenVerifier } from '../../../src/auth/access-token.verifier.js';
import { publicKeyPem, signTestToken } from '../../support/auth.js';

const SUB = '0193a4f0-0000-7000-8000-000000000001';

describe('AccessTokenVerifier', () => {
  let verifier: AccessTokenVerifier;
  beforeAll(async () => {
    verifier = new AccessTokenVerifier(await importSPKI(publicKeyPem, 'EdDSA'));
  });

  it('round-trips a valid token into the authenticated user', async () => {
    const token = await signTestToken({ sub: SUB, roles: ['customer', 'organizer'] });
    await expect(verifier.verify(token)).resolves.toEqual({
      id: SUB,
      roles: ['customer', 'organizer'],
    });
  });

  it('rejects an expired token', async () => {
    const token = await signTestToken({
      sub: SUB,
      roles: ['customer'],
      issuedAt: Math.floor(Date.now() / 1000) - 3600,
    });
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rejects a token signed with another key', async () => {
    const other = generateKeyPairSync('ed25519');
    const key = await importPKCS8(
      other.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
      'EdDSA',
    );
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ roles: ['customer'] })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(SUB)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .sign(key);
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rejects a wrong audience', async () => {
    const token = await signTestToken({ sub: SUB, roles: ['customer'], audience: 'other-api' });
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rejects a token with a different alg', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ roles: ['customer'] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(SUB)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .sign(new TextEncoder().encode('0123456789abcdef0123456789abcdef'));
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rejects garbage', async () => {
    await expect(verifier.verify('not-a-jwt')).rejects.toThrow();
  });
});
