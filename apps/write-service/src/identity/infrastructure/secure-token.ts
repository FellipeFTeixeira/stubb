import { createHash, randomBytes } from 'node:crypto';

// Token opaco de 32 bytes (verificação de e-mail e refresh). Só o hash vai para o banco.
export function generateSecureToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
