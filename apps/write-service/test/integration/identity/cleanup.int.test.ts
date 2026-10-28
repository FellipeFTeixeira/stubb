import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, countRows, rows, truncateAll } from '../setup.js';
import {
  advance,
  createIdentityApp,
  DAY,
  loginAs,
  postRegister,
  registerPayload,
  registerVerified,
  resetClock,
  type IdentityApp,
} from './helpers.js';

describe('IdentityCleanupJob (CA-26)', () => {
  let app: IdentityApp;
  let job: { deleteExpired(): Promise<{ refreshTokens: number; verifications: number }> };
  beforeAll(async () => {
    app = await createIdentityApp();
    const { IdentityCleanupJob } =
      await import('../../../src/identity/application/identity-cleanup.job.js');
    job = app.ctx.app.get(IdentityCleanupJob, { strict: false });
  });
  afterAll(async () => {
    await app.ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(app.ctx.dataSource);
    app.mailer.reset();
    resetClock();
  });

  it('apaga refresh vencido ou revogado há mais de 7 dias e preserva o resto', async () => {
    const account = await registerVerified(app);
    await loginAs(app.ctx, account); // expira em 7 dias
    advance(8 * DAY + 1000); // vencido há ~1 dia: dentro da retenção
    const recent = await loginAs(app.ctx, account); // vence daqui a 7 dias

    expect(await job.deleteExpired()).toMatchObject({ refreshTokens: 0 });

    advance(7 * DAY + 2 * 1000); // o primeiro venceu há mais de 7 dias; o segundo acabou de vencer
    expect(await job.deleteExpired()).toMatchObject({ refreshTokens: 1 });
    expect(await countRows(app.ctx.dataSource, 'identity_refresh_tokens')).toBe(1);
    expect(recent.refreshCookie).toBeTruthy();

    advance(7 * DAY);
    expect(await job.deleteExpired()).toMatchObject({ refreshTokens: 1 });
    expect(await countRows(app.ctx.dataSource, 'identity_refresh_tokens')).toBe(0);
  });

  it('apaga também o refresh revogado há mais de 7 dias, mesmo ainda dentro da validade', async () => {
    const account = await registerVerified(app);
    const logged = await loginAs(app.ctx, account);
    await api(app.ctx).delete('/api/identity/session').set('Cookie', logged.refreshCookie);

    advance(6 * DAY);
    expect((await job.deleteExpired()).refreshTokens).toBe(0);
    // Revogado há 7 dias e 1 s; o vencimento (7 dias após a emissão) ainda não entrou na retenção.
    advance(DAY + 1000);
    expect((await job.deleteExpired()).refreshTokens).toBe(1);
  });

  it('apaga links de verificação vencidos há mais de 7 dias', async () => {
    await postRegister(app.ctx, registerPayload());
    expect(await countRows(app.ctx.dataSource, 'identity_email_verifications')).toBe(1);

    advance(DAY + 7 * DAY - 1000); // venceu há menos de 7 dias
    expect((await job.deleteExpired()).verifications).toBe(0);
    advance(2000);
    expect((await job.deleteExpired()).verifications).toBe(1);
    const left = await rows<{ n: number }>(
      app.ctx.dataSource,
      'SELECT count(*)::int AS n FROM identity_email_verifications',
    );
    expect(left[0]?.n).toBe(0);
  });
});
