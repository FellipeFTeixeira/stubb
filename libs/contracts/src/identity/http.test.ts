import { describe, expect, it } from 'vitest';
import {
  AccessTokenClaimsSchema,
  ConfirmEmailRequestSchema,
  ListAdminOrganizerRequestsQuerySchema,
  LoginRequestSchema,
  MeResponseSchema,
  RegisterUserRequestSchema,
  RejectOrganizerRequestRequestSchema,
  RequestOrganizerRoleRequestSchema,
  ResendVerificationRequestSchema,
} from '../index.js';

const id = '0193a4f0-0000-7000-8000-000000000001';
const validRegister = {
  fullName: 'Maria Silva',
  email: 'maria@exemplo.com',
  password: 'senha-forte',
  cpf: '123.456.789-09',
};
const validRequest = {
  organizationName: 'Produtora X',
  cnpj: '11.222.333/0001-81',
  reason: 'Quero vender ingressos',
};

describe('RegisterUserRequestSchema', () => {
  it('aceita e normaliza e-mail e CPF', () => {
    const r = RegisterUserRequestSchema.parse({
      ...validRegister,
      email: '  Maria@Exemplo.COM ',
    });
    expect(r.email).toBe('maria@exemplo.com');
    expect(r.cpf).toBe('12345678909');
  });

  it('limites do nome: 3 a 120 depois do trim', () => {
    const name = (fullName: string) =>
      RegisterUserRequestSchema.safeParse({ ...validRegister, fullName });
    expect(name('ab').success).toBe(false);
    expect(name('  ab  ').success).toBe(false);
    expect(name('abc').success).toBe(true);
    expect(name('a'.repeat(120)).success).toBe(true);
    expect(name('a'.repeat(121)).success).toBe(false);
  });

  it('limites da senha: 8 a 128 em code points, sem trim', () => {
    const pw = (password: string) =>
      RegisterUserRequestSchema.safeParse({ ...validRegister, password });
    expect(pw('1234567').success).toBe(false);
    expect(pw('12345678').success).toBe(true);
    expect(pw('        ').success).toBe(true);
    expect(pw('😀'.repeat(7)).success).toBe(false);
    expect(pw('😀'.repeat(8)).success).toBe(true);
    expect(pw('😀'.repeat(128)).success).toBe(true);
    expect(pw('😀'.repeat(129)).success).toBe(false);
  });

  it('limite do e-mail: 254 caracteres', () => {
    const domain = (last: number) => `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(last)}.com`;
    const build = (total: number) => {
      const d = domain(61);
      return `${'a'.repeat(total - d.length - 1)}@${d}`;
    };
    const ok = build(254);
    const tooLong = build(255);
    expect(ok).toHaveLength(254);
    expect(tooLong).toHaveLength(255);
    expect(RegisterUserRequestSchema.safeParse({ ...validRegister, email: ok }).success).toBe(true);
    expect(RegisterUserRequestSchema.safeParse({ ...validRegister, email: tooLong }).success).toBe(
      false,
    );
    expect(
      RegisterUserRequestSchema.safeParse({ ...validRegister, email: 'sem-arroba' }).success,
    ).toBe(false);
  });

  it('rejeita CPF inválido com a mensagem esperada', () => {
    const r = RegisterUserRequestSchema.safeParse({ ...validRegister, cpf: '123.456.789-00' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('CPF inválido');
    expect(r.error?.issues[0]?.path).toEqual(['cpf']);
  });
});

describe('demais requests de command', () => {
  it('confirmação: token de 1 a 200', () => {
    expect(ConfirmEmailRequestSchema.safeParse({ token: '' }).success).toBe(false);
    expect(ConfirmEmailRequestSchema.safeParse({ token: 'a'.repeat(200) }).success).toBe(true);
    expect(ConfirmEmailRequestSchema.safeParse({ token: 'a'.repeat(201) }).success).toBe(false);
  });

  it('reenvio e login normalizam o e-mail para minúsculas', () => {
    expect(ResendVerificationRequestSchema.parse({ email: 'A@B.com' }).email).toBe('a@b.com');
    expect(LoginRequestSchema.parse({ email: 'A@B.com', password: 'x' }).email).toBe('a@b.com');
  });

  it('login: senha de 1 a 128', () => {
    expect(LoginRequestSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
    expect(
      LoginRequestSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(128) }).success,
    ).toBe(true);
    expect(
      LoginRequestSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(129) }).success,
    ).toBe(false);
  });

  it('pedido de produtor: limites e CNPJ normalizado', () => {
    const r = RequestOrganizerRoleRequestSchema.parse(validRequest);
    expect(r.cnpj).toBe('11222333000181');
    const alpha = RequestOrganizerRoleRequestSchema.parse({
      ...validRequest,
      cnpj: '12.abc.345/01de-35',
    });
    expect(alpha.cnpj).toBe('12ABC34501DE35');

    const org = (organizationName: string) =>
      RequestOrganizerRoleRequestSchema.safeParse({ ...validRequest, organizationName });
    expect(org('a').success).toBe(false);
    expect(org('ab').success).toBe(true);
    expect(org('a'.repeat(120)).success).toBe(true);
    expect(org('a'.repeat(121)).success).toBe(false);

    const reason = (v: string) =>
      RequestOrganizerRoleRequestSchema.safeParse({ ...validRequest, reason: v });
    expect(reason('   ').success).toBe(false);
    expect(reason('a'.repeat(500)).success).toBe(true);
    expect(reason('a'.repeat(501)).success).toBe(false);

    const bad = RequestOrganizerRoleRequestSchema.safeParse({
      ...validRequest,
      cnpj: '11.222.333/0001-80',
    });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe('CNPJ inválido');
  });

  it('recusa: mensagem opcional, vazia vira undefined, até 500', () => {
    expect(RejectOrganizerRequestRequestSchema.parse({}).message).toBeUndefined();
    expect(RejectOrganizerRequestRequestSchema.parse({ message: '   ' }).message).toBeUndefined();
    expect(RejectOrganizerRequestRequestSchema.parse({ message: ' oi ' }).message).toBe('oi');
    expect(
      RejectOrganizerRequestRequestSchema.safeParse({ message: 'a'.repeat(500) }).success,
    ).toBe(true);
    expect(
      RejectOrganizerRequestRequestSchema.safeParse({ message: 'a'.repeat(501) }).success,
    ).toBe(false);
  });
});

describe('queries e respostas', () => {
  it('lista do admin: defaults e limites', () => {
    expect(ListAdminOrganizerRequestsQuerySchema.parse({})).toEqual({
      status: 'pending',
      page: 1,
      pageSize: 20,
    });
    expect(
      ListAdminOrganizerRequestsQuerySchema.parse({
        status: 'rejected',
        page: '2',
        pageSize: '50',
      }),
    ).toEqual({ status: 'rejected', page: 2, pageSize: 50 });
    expect(ListAdminOrganizerRequestsQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(ListAdminOrganizerRequestsQuerySchema.safeParse({ pageSize: '51' }).success).toBe(false);
    expect(ListAdminOrganizerRequestsQuerySchema.safeParse({ status: 'x' }).success).toBe(false);
  });

  it('me: valida papéis', () => {
    const me = {
      id,
      email: 'a@b.com',
      fullName: 'A B C',
      cpf: '***.456.789-**',
      roles: ['customer'],
    };
    expect(MeResponseSchema.safeParse(me).success).toBe(true);
    expect(MeResponseSchema.safeParse({ ...me, roles: ['root'] }).success).toBe(false);
  });
});

describe('AccessTokenClaimsSchema', () => {
  const claims = {
    sub: id,
    roles: ['customer'],
    iss: 'stubb-identity',
    aud: 'stubb-api',
    iat: 1,
    exp: 901,
  };

  it('aceita claims válidas', () => {
    expect(AccessTokenClaimsSchema.safeParse(claims).success).toBe(true);
  });

  it('rejeita iss e aud errados, papéis vazios e sub inválido', () => {
    expect(AccessTokenClaimsSchema.safeParse({ ...claims, iss: 'outro' }).success).toBe(false);
    expect(AccessTokenClaimsSchema.safeParse({ ...claims, aud: 'outro' }).success).toBe(false);
    expect(AccessTokenClaimsSchema.safeParse({ ...claims, roles: [] }).success).toBe(false);
    expect(AccessTokenClaimsSchema.safeParse({ ...claims, sub: 'x' }).success).toBe(false);
  });
});
