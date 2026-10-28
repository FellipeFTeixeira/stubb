import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  type UserRole,
} from '@stubb/contracts';
import { SignJWT } from 'jose';

// Importado no topo de test/integration/setup.ts: as variáveis precisam existir antes do
// import() do AppModule, porque o config.ts lê process.env na importação.
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const toBase64Pem = (key: KeyObject, type: 'pkcs8' | 'spki') =>
  Buffer.from(key.export({ type, format: 'pem' }) as string, 'utf8').toString('base64');

process.env.JWT_PRIVATE_KEY = toBase64Pem(privateKey, 'pkcs8');
process.env.JWT_PUBLIC_KEY = toBase64Pem(publicKey, 'spki');
process.env.COOKIE_SECURE = 'false';
process.env.IDENTITY_SEED_ENABLED = 'false';

export const TEST_ORGANIZER_ID = '0193a4f0-0000-7000-8000-000000000001';
export const OTHER_ORGANIZER_ID = '0193a4f0-0000-7000-8000-0000000000aa';

export interface SignTestTokenOptions {
  sub: string;
  roles: UserRole[];
  /** Default 900. Negativo gera um token já vencido (a tolerância do verifier é de 30 s). */
  expiresInSeconds?: number;
  /** Default: agora. */
  issuedAt?: Date;
}

export async function signTestToken({
  sub,
  roles,
  expiresInSeconds = ACCESS_TOKEN_TTL_SECONDS,
  issuedAt = new Date(),
}: SignTestTokenOptions): Promise<string> {
  const iat = Math.floor(issuedAt.getTime() / 1000);
  return new SignJWT({ roles })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(sub)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + expiresInSeconds)
    .sign(privateKey);
}

export async function authHeader(
  sub: string,
  roles: UserRole[] = ['customer', 'organizer'],
): Promise<{ Authorization: string }> {
  return { Authorization: `Bearer ${await signTestToken({ sub, roles })}` };
}
