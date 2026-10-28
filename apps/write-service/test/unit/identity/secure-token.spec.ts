import { describe, expect, it } from 'vitest';
import {
  generateSecureToken,
  sha256Hex,
} from '../../../src/identity/infrastructure/secure-token.js';
import {
  buildVerificationEmail,
  verificationLink,
} from '../../../src/identity/infrastructure/verification-email.js';

describe('secure-token', () => {
  it('gera 32 bytes em base64url, sempre diferentes', () => {
    const a = generateSecureToken();
    const b = generateSecureToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('sha256Hex devolve 64 caracteres hexadecimais e é determinístico', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('verification-email', () => {
  it('o link usa PUBLIC_WEB_URL e o token, e o e-mail está em PT-BR', () => {
    expect(verificationLink('t0k')).toBe('http://127.0.0.1:8080/verificar-email?token=t0k');
    const email = buildVerificationEmail('ana@exemplo.com', 'Ana Souza', 't0k');
    expect(email.to).toBe('ana@exemplo.com');
    expect(email.subject).toBe('Confirme seu e-mail no Stubb');
    expect(email.text).toContain('Olá, Ana!');
    expect(email.text).toContain('http://127.0.0.1:8080/verificar-email?token=t0k');
    expect(email.html).toContain('href="http://127.0.0.1:8080/verificar-email?token=t0k"');
  });

  it('escapa HTML no nome', () => {
    const email = buildVerificationEmail('a@b.co', '<b>Ana</b> Souza', 't');
    expect(email.html).not.toContain('<b>');
    expect(email.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
  });
});
