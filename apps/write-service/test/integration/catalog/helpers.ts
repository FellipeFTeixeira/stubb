import { CatalogDomainEventSchema, type CatalogDomainEvent } from '@stubb/contracts';
import { Clock } from '../../../src/shared/clock/clock.js';
import { OTHER_ORGANIZER_ID, TEST_ORGANIZER_ID, authHeader } from '../../support/auth.js';
import { api, body, newKey, rows, type ProviderOverride, type TestApp } from '../setup.js';

// Relógio fixo: "agora" do write-service nos testes do Catalog.
export const NOW = new Date('2026-11-01T12:00:00.000Z');
// Estado mutável do relógio: os testes avançam o tempo com clockState.now e restauram com resetClock().
export const clockState = { now: NOW };
export const resetClock = () => {
  clockState.now = NOW;
};
export const CLOCK_OVERRIDE: ProviderOverride = {
  provide: Clock,
  useValue: { now: () => clockState.now },
};
export { OTHER_ORGANIZER_ID, TEST_ORGANIZER_ID };

export const STARTS_AT = '2026-12-10T23:00:00.000Z';
export const SALES_STARTS_AT = '2026-11-02T12:00:00.000Z';

export interface Accepted {
  id: string;
  version: number;
  entityId?: string;
}

export type Method = 'post' | 'patch' | 'delete';

// Envia o Bearer do produtor de teste por padrão; `actor` troca o `sub` do token (papel organizer).
export async function send(
  ctx: TestApp,
  method: Method,
  path: string,
  payload?: unknown,
  key: string | null = newKey(),
  actor: string = TEST_ORGANIZER_ID,
) {
  let req = api(ctx)
    [method](path)
    .set(await authHeader(actor));
  if (key !== null) req = req.set('Idempotency-Key', key);
  return payload === undefined ? req : req.send(payload as object);
}

// Envia um command esperando 202 e devolve o corpo.
export async function accept(
  ctx: TestApp,
  method: Method,
  path: string,
  payload?: unknown,
  actor: string = TEST_ORGANIZER_ID,
): Promise<Accepted> {
  const res = await send(ctx, method, path, payload, newKey(), actor);
  if (res.status !== 202) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
  }
  return body<Accepted>(res);
}

export const venueBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Teatro Aurora',
  address: 'Rua das Acácias, 120 - Centro',
  city: 'São Paulo',
  state: 'SP',
  timeZone: 'America/Sao_Paulo',
  ...overrides,
});

export const eventBody = (overrides: Record<string, unknown> = {}) => ({
  title: 'Hamlet',
  description: 'Montagem da tragédia de Shakespeare.',
  category: 'theater',
  ageRating: '14',
  ...overrides,
});

export const generalAdmission = (name = 'Pista', capacity = 200) => ({
  name,
  kind: 'general_admission',
  capacity,
});

export const seated = (name = 'Plateia') => ({
  name,
  kind: 'seated',
  rows: [
    { label: 'a', seats: 10 },
    { label: 'B', seats: 10 },
  ],
});

export const registerVenue = (ctx: TestApp, overrides: Record<string, unknown> = {}) =>
  accept(ctx, 'post', '/api/catalog/venues', venueBody(overrides));

export const addVenueSector = (ctx: TestApp, venueId: string, sector: unknown) =>
  accept(ctx, 'post', `/api/catalog/venues/${venueId}/sectors`, sector);

// Local com uma pista (200) e uma plateia (20 assentos).
export async function venueWithSectors(ctx: TestApp, overrides: Record<string, unknown> = {}) {
  const venue = await registerVenue(ctx, overrides);
  const pista = await addVenueSector(ctx, venue.id, generalAdmission());
  const plateia = await addVenueSector(ctx, venue.id, seated());
  return { venueId: venue.id, pistaId: pista.entityId ?? '', plateiaId: plateia.entityId ?? '' };
}

export const createEvent = (ctx: TestApp, overrides: Record<string, unknown> = {}) =>
  accept(ctx, 'post', '/api/catalog/events', eventBody(overrides));

export const sessionBody = (venueId: string, overrides: Record<string, unknown> = {}) => ({
  venueId,
  startsAt: STARTS_AT,
  salesStartsAt: SALES_STARTS_AT,
  timeZone: 'America/Sao_Paulo',
  ...overrides,
});

export const scheduleSession = (
  ctx: TestApp,
  eventId: string,
  venueId: string,
  overrides: Record<string, unknown> = {},
) =>
  accept(ctx, 'post', `/api/catalog/events/${eventId}/sessions`, sessionBody(venueId, overrides));

export const batchPath = (eventId: string, sessionId: string, sectorId: string) =>
  `/api/catalog/events/${eventId}/sessions/${sessionId}/sectors/${sectorId}/batches`;

export const addBatch = (
  ctx: TestApp,
  ids: { eventId: string; sessionId: string; sectorId: string },
  payload: Record<string, unknown> = {},
) =>
  accept(ctx, 'post', batchPath(ids.eventId, ids.sessionId, ids.sectorId), {
    name: 'Lote único',
    priceCents: 8000,
    ...payload,
  });

export interface SessionRow {
  id: string;
  status: string;
}
export interface SectorRow {
  id: string;
  venue_sector_id: string;
  name: string;
  position: number;
}

export const sessionSectors = (ctx: TestApp, sessionId: string) =>
  rows<SectorRow>(
    ctx.dataSource,
    'SELECT id, venue_sector_id, name, position FROM catalog_session_sectors WHERE session_id = $1 ORDER BY position',
    [sessionId],
  );

// Evento + local com planta + sessão em Rascunho, tudo pronto para lotes.
export async function draftSession(ctx: TestApp) {
  const venue = await venueWithSectors(ctx);
  const event = await createEvent(ctx);
  const session = await scheduleSession(ctx, event.id, venue.venueId);
  const sessionId = session.entityId ?? '';
  const sectors = await sessionSectors(ctx, sessionId);
  return { ...venue, eventId: event.id, sessionId, sectors };
}

// Sessão com um lote em cada setor, pronta para publicar.
export async function readySession(ctx: TestApp) {
  const draft = await draftSession(ctx);
  for (const sector of draft.sectors) {
    await addBatch(ctx, {
      eventId: draft.eventId,
      sessionId: draft.sessionId,
      sectorId: sector.id,
    });
  }
  return draft;
}

export const publishPath = (eventId: string, sessionId: string) =>
  `/api/catalog/events/${eventId}/sessions/${sessionId}/publish`;

export interface OutboxRow {
  bounded_context: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  event_type: string;
  payload: unknown;
}

export const outboxRows = (ctx: TestApp, aggregateId?: string) =>
  rows<OutboxRow>(
    ctx.dataSource,
    `SELECT bounded_context, aggregate_type, aggregate_id, aggregate_version::int AS aggregate_version,
            event_type, payload
       FROM outbox
      ${aggregateId ? 'WHERE aggregate_id = $1' : ''}
      ORDER BY occurred_at, aggregate_version`,
    aggregateId ? [aggregateId] : [],
  );

// O payload gravado é o envelope V1 inteiro; valida contra o schema público.
export function parseEnvelope(row: OutboxRow): CatalogDomainEvent {
  return CatalogDomainEventSchema.parse(row.payload);
}

// Falha com mensagem clara quando um elemento esperado não existe (evita `!` e `?? fail` repetidos).
export function must<T>(value: T | undefined | null, what = 'value'): T {
  if (value === undefined || value === null) throw new Error(`missing ${what}`);
  return value;
}
