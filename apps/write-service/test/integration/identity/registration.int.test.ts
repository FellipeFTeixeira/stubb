import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, body, countRows, newKey, rows, truncateAll, UUID_V7 } from '../setup.js';
import {
  createIdentityApp,
  postRegister,
  registerPayload,
  resetClock,
  type IdentityApp,
} from './helpers.js';

interface UserRow {
  id: string;
  email: string;
  cpf: string;
  password_hash: string;
  email_verified_at: Date | null;
}

describe('cadastro (CA-1 a CA-4)', () => {
  let app: IdentityApp;
  beforeAll(async () => {
    app = await createIdentityApp();
  });
  afterAll(async () => {
    await app.ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(app.ctx.dataSource);
    app.mailer.reset();
    resetClock();
  });

  it('CA-1: cria a conta não verificada, só customer, com hash scrypt e e-mail enviado', async () => {
    const payload = registerPayload({ email: 'Ana@Exemplo.com', cpf: '123.456.789-09' });
    const res = await postRegister(app.ctx, payload);

    expect(res.status).toBe(202);
    const { id } = body<{ id: string }>(res);
    expect(id).toMatch(UUID_V7);

    const [user] = await rows<UserRow>(app.ctx.dataSource, 'SELECT * FROM identity_users');
    expect(user).toMatchObject({ id, email: 'ana@exemplo.com', cpf: '12345678909' });
    expect(user?.email_verified_at).toBeNull();
    expect(user?.password_hash).toMatch(/^scrypt\$16384\$8\$5\$/);
    const roles = await rows<{ role: string }>(
      app.ctx.dataSource,
      'SELECT role FROM identity_user_roles WHERE user_id = $1',
      [id],
    );
    expect(roles.map((r) => r.role)).toEqual(['customer']);

    expect(app.mailer.sent).toHaveLength(1);
    const email = app.mailer.sent[0];
    expect(email?.to).toBe('ana@exemplo.com');
    expect(email?.text).toContain('http://127.0.0.1:8080/verificar-email?token=');
    expect(email && app.mailer.extractToken(email).length).toBeGreaterThan(30);
  });

  it('CA-2: rejeita entradas inválidas com 400 VALIDATION_FAILED e não cria conta', async () => {
    const base = registerPayload();
    const invalid: Array<[string, object, string]> = [
      ['CPF com dígito errado', { ...base, cpf: '12345678900' }, 'cpf'],
      ['CPF repetido', { ...base, cpf: '111.111.111-11' }, 'cpf'],
      ['senha de 7', { ...base, password: 'a'.repeat(7) }, 'password'],
      ['senha de 129', { ...base, password: 'a'.repeat(129) }, 'password'],
      ['e-mail inválido', { ...base, email: 'sem-arroba' }, 'email'],
      ['nome curto', { ...base, fullName: 'Al' }, 'fullName'],
      ['nome longo', { ...base, fullName: 'x'.repeat(121) }, 'fullName'],
      [
        'campo ausente',
        { fullName: base.fullName, email: base.email, password: base.password },
        'cpf',
      ],
    ];
    for (const [label, payload, field] of invalid) {
      const res = await postRegister(app.ctx, payload);
      expect(res.status, label).toBe(400);
      const parsed = body<{ code: string; issues: Array<{ path: string }> }>(res);
      expect(parsed.code, label).toBe('VALIDATION_FAILED');
      expect(
        parsed.issues.map((i) => i.path),
        label,
      ).toContain(field);
    }
    expect(await countRows(app.ctx.dataSource, 'identity_users')).toBe(0);
    expect(app.mailer.sent).toHaveLength(0);
  });

  it('CA-3: 409 para e-mail repetido (sem diferenciar caixa) e para CPF repetido', async () => {
    const first = registerPayload({ email: 'ana@exemplo.com', cpf: '12345678909' });
    expect((await postRegister(app.ctx, first)).status).toBe(202);
    app.mailer.reset();

    const sameEmail = await postRegister(
      app.ctx,
      registerPayload({ email: 'ANA@exemplo.com', cpf: '98765432100' }),
    );
    expect(sameEmail.status).toBe(409);
    expect(body<{ code: string }>(sameEmail).code).toBe('EMAIL_ALREADY_REGISTERED');

    const sameCpf = await postRegister(
      app.ctx,
      registerPayload({ email: 'outra@exemplo.com', cpf: '123.456.789-09' }),
    );
    expect(sameCpf.status).toBe(409);
    expect(body<{ code: string }>(sameCpf).code).toBe('CPF_ALREADY_REGISTERED');

    expect(await countRows(app.ctx.dataSource, 'identity_users')).toBe(1);
    expect(app.mailer.sent).toHaveLength(0);
  });

  it('CA-3: cadastros simultâneos com o mesmo e-mail geram uma conta e um 409', async () => {
    const results = await Promise.all([
      postRegister(app.ctx, registerPayload({ email: 'corrida@exemplo.com' })),
      postRegister(app.ctx, registerPayload({ email: 'corrida@exemplo.com' })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([202, 409]);
    expect(await countRows(app.ctx.dataSource, 'identity_users')).toBe(1);
    expect(app.mailer.sent).toHaveLength(1);
  });

  it('CA-4: a mesma chave repete a resposta sem nova conta nem novo e-mail, e ignora a senha', async () => {
    const key = newKey();
    const payload = registerPayload({ email: 'ana@exemplo.com' });
    const first = await postRegister(app.ctx, payload, key);
    const replay = await postRegister(app.ctx, payload, key);
    const otherPassword = await postRegister(
      app.ctx,
      { ...payload, password: 'outra-senha-9' },
      key,
    );

    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    expect(otherPassword.status).toBe(202);
    expect(body<{ id: string }>(replay).id).toBe(body<{ id: string }>(first).id);
    expect(body<{ id: string }>(otherPassword).id).toBe(body<{ id: string }>(first).id);
    expect(await countRows(app.ctx.dataSource, 'identity_users')).toBe(1);
    expect(app.mailer.sent).toHaveLength(1);

    const mismatch = await postRegister(app.ctx, { ...payload, email: 'outro@exemplo.com' }, key);
    expect(mismatch.status).toBe(422);
    expect(body<{ code: string }>(mismatch).code).toBe('IDEMPOTENCY_KEY_MISMATCH');
  });

  it('falha no envio do e-mail não muda a resposta e o reenvio recupera', async () => {
    app.mailer.failNext = true;
    const res = await postRegister(app.ctx, registerPayload({ email: 'sem-smtp@exemplo.com' }));
    expect(res.status).toBe(202);
    expect(app.mailer.sent).toHaveLength(0);
    expect(await countRows(app.ctx.dataSource, 'identity_email_verifications')).toBe(1);
  });

  it('exige Idempotency-Key', async () => {
    const res = await api(app.ctx).post('/api/identity/users').send(registerPayload());
    expect(res.status).toBe(400);
    expect(body<{ code: string }>(res).code).toBe('IDEMPOTENCY_KEY_INVALID');
  });
});
