import { generateKeyPairSync } from 'node:crypto';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, type UserRole } from '@stubb/contracts';
import { importPKCS8, SignJWT } from 'jose';

export const TEST_ORGANIZER_ID = '0193a4f0-0000-7000-8000-000000000001';
export const OTHER_ORGANIZER_ID = '0193a4f0-0000-7000-8000-0000000000aa';

// Ephemeral Ed25519 pair per process: tokens signed here verify only against `publicKeyPem`.
const pair = generateKeyPairSync('ed25519');
const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
export const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }) as string;

const privateKey = importPKCS8(privatePem, JWT_ALGORITHM);

export interface SignTestTokenOptions {
  sub: string;
  roles: UserRole[];
  expiresInSeconds?: number;
  issuedAt?: number;
  audience?: string;
}

export async function signTestToken({
  sub,
  roles,
  expiresInSeconds = 900,
  issuedAt = Math.floor(Date.now() / 1000),
  audience = JWT_AUDIENCE,
}: SignTestTokenOptions): Promise<string> {
  return new SignJWT({ roles })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(sub)
    .setIssuer(JWT_ISSUER)
    .setAudience(audience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + expiresInSeconds)
    .sign(await privateKey);
}

export async function authHeader(
  sub: string,
  roles: UserRole[] = ['customer', 'organizer'],
): Promise<{ Authorization: string }> {
  return { Authorization: `Bearer ${await signTestToken({ sub, roles })}` };
}
