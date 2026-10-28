import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const N = 16384;
const R = 8;
const P = 5;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// O scrypt usa cerca de 128 * N * r bytes (16 MiB aqui); o teto explícito dá folga ao padrão de 32 MiB.
const MAX_MEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  const options: ScryptOptions = { N: n, r, p, maxmem: MAX_MEM };
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

// Formato: scrypt$N$r$p$<salt base64url>$<hash base64url> (D-3).
@Injectable()
export class PasswordHasher {
  // Hash fixo gerado na inicialização: iguala o tempo do login com e-mail inexistente (RN-25).
  private readonly dummyHash: Promise<string> = this.hash(randomBytes(16).toString('hex'));

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await derive(password, salt, N, R, P);
    return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, salt, hash] = parts as [string, string, string, string, string, string];
    const expected = Buffer.from(hash, 'base64url');
    const actual = await derive(
      password,
      Buffer.from(salt, 'base64url'),
      Number(n),
      Number(r),
      Number(p),
    );
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async verifyAgainstDummy(): Promise<void> {
    await this.verify('senha-inexistente', await this.dummyHash);
  }
}
