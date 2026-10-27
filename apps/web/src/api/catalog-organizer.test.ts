import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '@/test/fake-api';
import {
  addBatch,
  addSessionSector,
  addVenueSector,
  createEvent,
  discardEvent,
  getOrganizerEvent,
  getVenue,
  listOrganizerEvents,
  listVenues,
  publishSession,
  registerVenue,
  removeBatch,
  removeSession,
  removeSessionSector,
  removeVenueSector,
  scheduleSession,
  updateEventDetails,
  updateVenueDetails,
} from './catalog-organizer';

const V = '0190a0a0-0000-7000-8000-000000000001';
const E = '0190a0a0-0000-7000-8000-000000000002';
const S = '0190a0a0-0000-7000-8000-000000000003';
const SS = '0190a0a0-0000-7000-8000-000000000004';
const B = '0190a0a0-0000-7000-8000-000000000005';
const KEY = '0190a0a0-0000-7000-8000-0000000000aa';

const venueDetails = {
  name: 'Arena',
  address: 'Rua A, 1',
  city: 'Porto Alegre',
  state: 'RS' as const,
  timeZone: 'America/Sao_Paulo' as const,
};
const eventDetails = {
  title: 'Show',
  description: 'Descrição',
  category: 'show' as const,
  ageRating: 'L' as const,
  imageUrl: null,
};

let api: ReturnType<typeof createFakeApi>;

beforeEach(() => {
  api = createFakeApi();
  for (const [method, path] of [
    ['POST', '/api/catalog/venues'],
    ['PATCH', '/api/catalog/venues/:venueId'],
    ['DELETE', '/api/catalog/venues/:venueId/sectors/:venueSectorId'],
    ['POST', '/api/catalog/events'],
    ['PATCH', '/api/catalog/events/:eventId'],
    ['DELETE', '/api/catalog/events/:eventId'],
    ['DELETE', '/api/catalog/events/:eventId/sessions/:sessionId'],
    ['POST', '/api/catalog/events/:eventId/sessions/:sessionId/publish'],
    ['DELETE', '/api/catalog/events/:eventId/sessions/:sessionId/sectors/:sectorId'],
    [
      'DELETE',
      '/api/catalog/events/:eventId/sessions/:sessionId/sectors/:sectorId/batches/:batchId',
    ],
  ] as const) {
    api.on(method, path, () => ({ status: 202, body: { id: V, version: 2 } }));
  }
  for (const path of [
    '/api/catalog/venues/:venueId/sectors',
    '/api/catalog/events/:eventId/sessions',
    '/api/catalog/events/:eventId/sessions/:sessionId/sectors',
    '/api/catalog/events/:eventId/sessions/:sessionId/sectors/:sectorId/batches',
  ]) {
    api.on('POST', path, () => ({ status: 202, body: { id: V, version: 2, entityId: S } }));
  }
  api.install();
});
afterEach(() => vi.unstubAllGlobals());

function last() {
  const call = api.calls.at(-1);
  if (!call) throw new Error('nenhuma requisição');
  return call;
}

describe('commands do Catalog', () => {
  it('registerVenue: POST /venues com corpo e chave', async () => {
    await registerVenue(venueDetails, KEY);
    expect(last()).toMatchObject({
      method: 'POST',
      path: '/api/catalog/venues',
      body: venueDetails,
    });
    expect(last().headers['idempotency-key']).toBe(KEY);
  });

  it('updateVenueDetails: PATCH com expectedVersion', async () => {
    const body = { ...venueDetails, expectedVersion: 3 };
    await updateVenueDetails(V, body, KEY);
    expect(last()).toMatchObject({ method: 'PATCH', path: `/api/catalog/venues/${V}`, body });
  });

  it('addVenueSector: POST nos setores e devolve entityId', async () => {
    const body = { name: 'Pista', kind: 'general_admission' as const, capacity: 100 };
    const result = await addVenueSector(V, body, KEY);
    expect(result.entityId).toBe(S);
    expect(last()).toMatchObject({
      method: 'POST',
      path: `/api/catalog/venues/${V}/sectors`,
      body,
    });
  });

  it('removeVenueSector: DELETE sem corpo e sem Content-Type', async () => {
    await removeVenueSector(V, S, KEY);
    expect(last()).toMatchObject({
      method: 'DELETE',
      path: `/api/catalog/venues/${V}/sectors/${S}`,
      body: undefined,
    });
    expect(last().headers['content-type']).toBeUndefined();
    expect(last().headers['idempotency-key']).toBe(KEY);
  });

  it('createEvent e updateEventDetails', async () => {
    await createEvent(eventDetails, KEY);
    expect(last()).toMatchObject({
      method: 'POST',
      path: '/api/catalog/events',
      body: eventDetails,
    });
    const body = { ...eventDetails, expectedVersion: 2 };
    await updateEventDetails(E, body, KEY);
    expect(last()).toMatchObject({ method: 'PATCH', path: `/api/catalog/events/${E}`, body });
  });

  it('discardEvent: DELETE sem corpo', async () => {
    await discardEvent(E, KEY);
    expect(last()).toMatchObject({
      method: 'DELETE',
      path: `/api/catalog/events/${E}`,
      body: undefined,
    });
  });

  it('scheduleSession: POST nas sessões e devolve entityId', async () => {
    const body = {
      venueId: V,
      startsAt: '2026-12-11T00:00:00.000Z',
      salesStartsAt: '2026-11-01T00:00:00.000Z',
      timeZone: 'America/Manaus' as const,
    };
    const result = await scheduleSession(E, body, KEY);
    expect(result.entityId).toBe(S);
    expect(last()).toMatchObject({
      method: 'POST',
      path: `/api/catalog/events/${E}/sessions`,
      body,
    });
  });

  it('removeSession e publishSession (corpo vazio {})', async () => {
    await removeSession(E, S, KEY);
    expect(last()).toMatchObject({
      method: 'DELETE',
      path: `/api/catalog/events/${E}/sessions/${S}`,
      body: undefined,
    });
    await publishSession(E, S, KEY);
    expect(last()).toMatchObject({
      method: 'POST',
      path: `/api/catalog/events/${E}/sessions/${S}/publish`,
      body: {},
    });
  });

  it('addSessionSector e removeSessionSector', async () => {
    await addSessionSector(E, S, { venueSectorId: SS }, KEY);
    expect(last()).toMatchObject({
      method: 'POST',
      path: `/api/catalog/events/${E}/sessions/${S}/sectors`,
      body: { venueSectorId: SS },
    });
    await removeSessionSector(E, S, SS, KEY);
    expect(last()).toMatchObject({
      method: 'DELETE',
      path: `/api/catalog/events/${E}/sessions/${S}/sectors/${SS}`,
      body: undefined,
    });
  });

  it('addBatch e removeBatch', async () => {
    const body = { name: 'Lote 1', priceCents: 123456, quantity: null, endsAt: null };
    await addBatch(E, S, SS, body, KEY);
    expect(last()).toMatchObject({
      method: 'POST',
      path: `/api/catalog/events/${E}/sessions/${S}/sectors/${SS}/batches`,
      body,
    });
    await removeBatch(E, S, SS, B, KEY);
    expect(last()).toMatchObject({
      method: 'DELETE',
      path: `/api/catalog/events/${E}/sessions/${S}/sectors/${SS}/batches/${B}`,
      body: undefined,
    });
  });
});

describe('leituras do produtor', () => {
  it('getVenue manda min_version e traz minVersionReached; 404 também traz', async () => {
    api.on('GET', '/api/catalog/organizer/venues/:venueId', ({ query }) =>
      query.min_version === '9'
        ? { status: 404, body: { statusCode: 404, message: 'x', minVersionReached: false } }
        : {
            status: 200,
            body: {
              venue: {
                id: V,
                version: 2,
                name: 'Arena',
                address: 'Rua A',
                city: 'POA',
                state: 'RS',
                timeZone: 'America/Sao_Paulo',
                sectors: [],
              },
              minVersionReached: true,
            },
          },
    );
    const found = await getVenue(V, 2);
    expect(found).toMatchObject({ status: 'found', minVersionReached: true });
    expect(last().query).toEqual({ min_version: '2' });
    expect(await getVenue(V, 9)).toEqual({ status: 'not-found', minVersionReached: false });
  });

  it('getOrganizerEvent sem min_version não manda o parâmetro', async () => {
    await getOrganizerEvent(E);
    expect(last()).toMatchObject({ path: `/api/catalog/organizer/events/${E}`, query: {} });
  });

  it('listOrganizerEvents manda page; listVenues não manda nada', async () => {
    api.on('GET', '/api/catalog/organizer/events', () => ({
      status: 200,
      body: { items: [], page: 2, pageSize: 12, total: 0 },
    }));
    api.on('GET', '/api/catalog/organizer/venues', () => ({ status: 200, body: { items: [] } }));
    await listOrganizerEvents(2);
    expect(last()).toMatchObject({ path: '/api/catalog/organizer/events', query: { page: '2' } });
    await listVenues();
    expect(last()).toMatchObject({ path: '/api/catalog/organizer/venues', query: {} });
  });
});
