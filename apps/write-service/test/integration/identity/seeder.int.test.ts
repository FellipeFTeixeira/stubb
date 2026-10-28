import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, body, countRows, rows, truncateAll } from '../setup.js';
import { createIdentityApp, postLogin, type IdentityApp } from './helpers.js';

const ADMIN_ID = '0193a4f0-0000-7000-8000-000000000000';
const ORGANIZER_ID = '0193a4f0-0000-7000-8000-000000000001';

describe('IdentitySeeder (CA-25)', () => {
  let app: IdentityApp;
  let seeder: { seed(): Promise<void>; onApplicationBootstrap(): Promise<void> };
  beforeAll(async () => {
    app = await createIdentityApp();
    const { IdentitySeeder } = await import('../../../src/identity/application/identity-seeder.js');
    seeder = app.ctx.app.get(IdentitySeeder, { strict: false });
  });
  afterAll(async () => {
    await app.ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(app.ctx.dataSource);
  });

  const rolesOf = async (userId: string) =>
    (
      await rows<{ role: string }>(
        app.ctx.dataSource,
        'SELECT role FROM identity_user_roles WHERE user_id = $1 ORDER BY role',
        [userId],
      )
    ).map((r) => r.role);

  it('com IDENTITY_SEED_ENABLED=false o bootstrap não cria nada', async () => {
    await seeder.onApplicationBootstrap();
    expect(await countRows(app.ctx.dataSource, 'identity_users')).toBe(0);
  });

  it('cria o admin e o produtor seed verificados, com papéis e pedido aprovado', async () => {
    await seeder.seed();

    const users = await rows<{ id: string; email: string; email_verified_at: Date | null }>(
      app.ctx.dataSource,
      'SELECT id, email, email_verified_at FROM identity_users ORDER BY email',
    );
    expect(users.map((u) => [u.id, u.email])).toEqual([
      [ADMIN_ID, 'admin@stubb.local'],
      [ORGANIZER_ID, 'produtor@stubb.local'],
    ]);
    expect(users.every((u) => u.email_verified_at !== null)).toBe(true);
    expect(await rolesOf(ADMIN_ID)).toEqual(['admin', 'customer', 'organizer']);
    expect(await rolesOf(ORGANIZER_ID)).toEqual(['customer', 'organizer']);

    const requests = await rows<{
      user_id: string;
      status: string;
      organization_name: string;
      cnpj: string;
      reason: string;
      decided_by: string;
    }>(app.ctx.dataSource, 'SELECT * FROM identity_organizer_requests');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      user_id: ORGANIZER_ID,
      status: 'approved',
      organization_name: 'Produtora Demo',
      cnpj: '11222333000181',
      reason: 'Conta de demonstração do Catalog',
      decided_by: ADMIN_ID,
    });
  });

  it('rodar duas vezes não duplica nada', async () => {
    await seeder.seed();
    await seeder.seed();
    expect(await countRows(app.ctx.dataSource, 'identity_users')).toBe(2);
    expect(await countRows(app.ctx.dataSource, 'identity_user_roles')).toBe(5);
    expect(await countRows(app.ctx.dataSource, 'identity_organizer_requests')).toBe(1);
  });

  it('as contas semeadas entram com as senhas configuradas e o token traz os papéis', async () => {
    await seeder.seed();
    const admin = await postLogin(app.ctx, 'admin@stubb.local', 'stubb-admin-dev');
    expect(admin.status).toBe(200);
    const organizer = await postLogin(app.ctx, 'produtor@stubb.local', 'stubb-produtor-dev');
    expect(organizer.status).toBe(200);

    const claims = JSON.parse(
      Buffer.from(
        body<{ accessToken: string }>(organizer).accessToken.split('.')[1] as string,
        'base64url',
      ).toString(),
    ) as { sub: string; roles: string[] };
    expect(claims).toMatchObject({ sub: ORGANIZER_ID, roles: ['customer', 'organizer'] });

    const wrong = await postLogin(app.ctx, 'admin@stubb.local', 'errada-1234');
    expect(wrong.status).toBe(401);
    // O admin consegue chamar uma rota restrita.
    const list = await api(app.ctx)
      .get('/api/identity/admin/organizer-requests?status=approved')
      .set('Authorization', `Bearer ${body<{ accessToken: string }>(admin).accessToken}`);
    expect(list.status).toBe(200);
    expect(body<{ total: number }>(list).total).toBe(1);
  });

  it('não recria o pedido aprovado se o produtor já tem algum pedido', async () => {
    await seeder.seed();
    await app.ctx.dataSource.query(
      `UPDATE identity_organizer_requests SET status = 'rejected', rejection_message = 'x'`,
    );
    await seeder.seed();
    expect(await countRows(app.ctx.dataSource, 'identity_organizer_requests')).toBe(1);
  });
});
