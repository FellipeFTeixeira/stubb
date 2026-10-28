import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { body, countRows, rows, truncateAll } from '../setup.js';
import {
  advance,
  createIdentityApp,
  DAY,
  HOUR,
  postConfirm,
  postRegister,
  postResend,
  registerPayload,
  resetClock,
  SECOND,
  type IdentityApp,
} from './helpers.js';

describe('verificação de e-mail (CA-5, CA-6)', () => {
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

  async function signUp(email = 'ana@exemplo.com') {
    const res = await postRegister(app.ctx, registerPayload({ email }));
    expect(res.status).toBe(202);
    const sent = app.mailer.to(email).at(-1);
    if (!sent) throw new Error('sem e-mail');
    return { id: body<{ id: string }>(res).id, token: app.mailer.extractToken(sent) };
  }

  const verifiedAt = async (id: string) =>
    (
      await rows<{ email_verified_at: Date | null }>(
        app.ctx.dataSource,
        'SELECT email_verified_at FROM identity_users WHERE id = $1',
        [id],
      )
    )[0]?.email_verified_at;

  it('CA-5: o link confirma a conta e repetir o mesmo token responde 202 sem mudar nada', async () => {
    const { id, token } = await signUp();
    advance(HOUR);

    const first = await postConfirm(app.ctx, token);
    expect(first.status).toBe(202);
    expect(body<{ id: string }>(first).id).toBe(id);
    const stamp = await verifiedAt(id);
    expect(stamp?.toISOString()).toBe(new Date('2026-11-01T13:00:00.000Z').toISOString());

    advance(HOUR);
    const again = await postConfirm(app.ctx, token);
    expect(again.status).toBe(202);
    expect(body<{ id: string }>(again).id).toBe(id);
    expect((await verifiedAt(id))?.toISOString()).toBe(stamp?.toISOString());
  });

  it('CA-5: token inexistente responde 422 VERIFICATION_TOKEN_INVALID', async () => {
    const res = await postConfirm(app.ctx, 'token-que-nao-existe');
    expect(res.status).toBe(422);
    expect(body<{ code: string }>(res).code).toBe('VERIFICATION_TOKEN_INVALID');
  });

  it('CA-5: token com mais de 24 h responde 422 e a conta continua não verificada', async () => {
    const { id, token } = await signUp();
    advance(DAY + SECOND);
    const res = await postConfirm(app.ctx, token);
    expect(res.status).toBe(422);
    expect(body<{ code: string }>(res).code).toBe('VERIFICATION_TOKEN_INVALID');
    expect(await verifiedAt(id)).toBeNull();
  });

  it('CA-5: token ainda válido aos 23 h 59 min', async () => {
    const { token } = await signUp();
    advance(DAY - 60 * SECOND);
    expect((await postConfirm(app.ctx, token)).status).toBe(202);
  });

  it('CA-6: reenvio depois de 60 s envia e-mail novo e invalida o link anterior', async () => {
    const { id, token: oldToken } = await signUp();
    advance(60 * SECOND);

    const res = await postResend(app.ctx, 'ana@exemplo.com');
    expect(res.status).toBe(202);
    expect(res.body).toEqual({});
    expect(app.mailer.to('ana@exemplo.com')).toHaveLength(2);
    const newToken = app.mailer.extractToken(app.mailer.sent[1]!);
    expect(newToken).not.toBe(oldToken);

    const old = await postConfirm(app.ctx, oldToken);
    expect(old.status).toBe(422);
    expect(body<{ code: string }>(old).code).toBe('VERIFICATION_TOKEN_INVALID');
    expect((await postConfirm(app.ctx, newToken)).status).toBe(202);
    expect(await verifiedAt(id)).not.toBeNull();
  });

  it('CA-6: reenvio com menos de 60 s não envia e-mail', async () => {
    await signUp();
    advance(59 * SECOND);
    expect((await postResend(app.ctx, 'ana@exemplo.com')).status).toBe(202);
    expect(app.mailer.sent).toHaveLength(1);
  });

  it('CA-6: e-mail inexistente ou conta já verificada respondem 202 e não enviam nada', async () => {
    const { token } = await signUp();
    await postConfirm(app.ctx, token);
    app.mailer.reset();
    advance(HOUR);

    expect((await postResend(app.ctx, 'ana@exemplo.com')).status).toBe(202);
    expect((await postResend(app.ctx, 'ninguem@exemplo.com')).status).toBe(202);
    expect(app.mailer.sent).toHaveLength(0);
    expect(await countRows(app.ctx.dataSource, 'identity_email_verifications')).toBe(1);
  });

  it('valida o corpo do reenvio e da confirmação', async () => {
    expect((await postResend(app.ctx, 'sem-arroba')).status).toBe(400);
    expect((await postConfirm(app.ctx, '')).status).toBe(400);
  });
});
