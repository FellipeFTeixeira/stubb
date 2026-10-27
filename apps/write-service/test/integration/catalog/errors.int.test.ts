import {
  DomainErrorResponseSchema,
  ValidationErrorResponseSchema,
  type CommandErrorCode,
} from '@stubb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { body, createTestApp, newKey, truncateAll, type TestApp } from '../setup.js';
import {
  CLOCK_OVERRIDE,
  addVenueSector,
  eventBody,
  generalAdmission,
  registerVenue,
  send,
  venueBody,
} from './helpers.js';

const MISSING = '0190a0a0-0000-7000-8000-000000000999';

describe('Contrato de erro (CA-24)', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp([CLOCK_OVERRIDE]);
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await truncateAll(ctx.dataSource);
  });

  it('400 de validação traz issues com o caminho do campo', async () => {
    const res = await send(
      ctx,
      'post',
      '/api/catalog/venues',
      venueBody({ name: '   ', state: 'XX' }),
    );
    expect(res.status).toBe(400);
    const parsed = ValidationErrorResponseSchema.parse(body(res));
    expect(parsed.issues.map((i) => i.path).sort()).toEqual(['name', 'state']);
  });

  it('400 para parâmetro de rota que não é UUID também valida', async () => {
    const res = await send(
      ctx,
      'patch',
      '/api/catalog/venues/nao-e-uuid',
      venueBody({ expectedVersion: 1 }),
    );
    expect(res.status).toBe(400);
    expect(ValidationErrorResponseSchema.safeParse(body(res)).success).toBe(true);
  });

  it('400 IDEMPOTENCY_KEY_INVALID sem o header', async () => {
    const res = await send(ctx, 'post', '/api/catalog/venues', venueBody(), null);
    expect(res.status).toBe(400);
    expect(DomainErrorResponseSchema.parse(body(res)).code).toBe('IDEMPOTENCY_KEY_INVALID');
  });

  it.each<[string, number, CommandErrorCode]>([
    ['PATCH local inexistente', 404, 'AGGREGATE_NOT_FOUND'],
    ['DELETE setor inexistente', 404, 'ENTITY_NOT_FOUND'],
    ['PATCH com versão antiga', 409, 'CONCURRENCY_CONFLICT'],
    ['nome de setor repetido', 422, 'VENUE_SECTOR_NAME_TAKEN'],
    ['chave reutilizada com outro corpo', 422, 'IDEMPOTENCY_KEY_MISMATCH'],
  ])('%s -> %i %s valida com DomainErrorResponseSchema', async (name, status, code) => {
    const venue = await registerVenue(ctx);
    await addVenueSector(ctx, venue.id, generalAdmission('Pista'));
    const responses = {
      'PATCH local inexistente': () =>
        send(ctx, 'patch', `/api/catalog/venues/${MISSING}`, venueBody({ expectedVersion: 1 })),
      'DELETE setor inexistente': () =>
        send(ctx, 'delete', `/api/catalog/venues/${venue.id}/sectors/${MISSING}`),
      'PATCH com versão antiga': () =>
        send(ctx, 'patch', `/api/catalog/venues/${venue.id}`, venueBody({ expectedVersion: 1 })),
      'nome de setor repetido': () =>
        send(ctx, 'post', `/api/catalog/venues/${venue.id}/sectors`, generalAdmission('pista')),
      'chave reutilizada com outro corpo': async () => {
        const key = newKey();
        await send(ctx, 'post', '/api/catalog/events', eventBody(), key);
        return send(ctx, 'post', '/api/catalog/events', eventBody({ title: 'Outro' }), key);
      },
    } as const;
    const res = await responses[name as keyof typeof responses]();
    expect(res.status).toBe(status);
    const parsed = DomainErrorResponseSchema.parse(body(res));
    expect(parsed).toMatchObject({ statusCode: status, code });
    expect(parsed.message.length).toBeGreaterThan(0);
  });
});
