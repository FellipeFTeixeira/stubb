import { importPKCS8, importSPKI } from 'jose';
import { JWT_ALGORITHM } from '@stubb/contracts';

export interface JwtKeys {
  privateKey: Awaited<ReturnType<typeof importPKCS8>>;
  publicKey: Awaited<ReturnType<typeof importSPKI>>;
}

export const JWT_KEYS = Symbol('JWT_KEYS');

const decodePem = (value: string): string => Buffer.from(value, 'base64').toString('utf8');

// As variáveis trazem o PEM em base64 numa linha (ver `pnpm jwt:keys`).
export async function loadJwtKeys(env: {
  JWT_PRIVATE_KEY?: string | undefined;
  JWT_PUBLIC_KEY?: string | undefined;
}): Promise<JwtKeys> {
  if (!env.JWT_PRIVATE_KEY || !env.JWT_PUBLIC_KEY) {
    throw new Error('JWT_PRIVATE_KEY/JWT_PUBLIC_KEY ausente');
  }
  return {
    privateKey: await importPKCS8(decodePem(env.JWT_PRIVATE_KEY), JWT_ALGORITHM),
    publicKey: await importSPKI(decodePem(env.JWT_PUBLIC_KEY), JWT_ALGORITHM),
  };
}
