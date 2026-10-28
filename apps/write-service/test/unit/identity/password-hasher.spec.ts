import { describe, expect, it } from 'vitest';
import { PasswordHasher } from '../../../src/identity/infrastructure/password-hasher.js';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('gera o formato scrypt$16384$8$5$<salt>$<hash>', async () => {
    const stored = await hasher.hash('minha-senha');
    const parts = stored.split('$');
    expect(parts).toHaveLength(6);
    expect(parts.slice(0, 4)).toEqual(['scrypt', '16384', '8', '5']);
    expect(Buffer.from(parts[4] as string, 'base64url')).toHaveLength(16);
    expect(Buffer.from(parts[5] as string, 'base64url')).toHaveLength(64);
  });

  it('ida e volta: senha certa passa e senha errada falha', async () => {
    const stored = await hasher.hash('minha-senha');
    expect(await hasher.verify('minha-senha', stored)).toBe(true);
    expect(await hasher.verify('minha-senhA', stored)).toBe(false);
    expect(await hasher.verify('', stored)).toBe(false);
  });

  it('o salt muda a cada hash da mesma senha', async () => {
    const [a, b] = await Promise.all([hasher.hash('igual'), hasher.hash('igual')]);
    expect(a).not.toBe(b);
  });

  it('conta emoji como um caractere só na entrada e não quebra com unicode', async () => {
    const stored = await hasher.hash('sênha-😀-ção');
    expect(await hasher.verify('sênha-😀-ção', stored)).toBe(true);
  });

  it('formato inválido nunca passa', async () => {
    expect(await hasher.verify('x', 'texto-solto')).toBe(false);
    expect(await hasher.verify('x', 'bcrypt$1$2$3$4$5')).toBe(false);
    expect(await hasher.verify('x', 'scrypt$16384$8$5$abc')).toBe(false);
  });

  it('verifyAgainstDummy roda sem erro e sem resultado', async () => {
    await expect(hasher.verifyAgainstDummy()).resolves.toBeUndefined();
  });
});
