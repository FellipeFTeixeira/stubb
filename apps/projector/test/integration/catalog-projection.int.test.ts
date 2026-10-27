import { READ_STORE_COLLECTIONS, READ_STORE_COLLECTION_NAMES } from '@stubb/contracts';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildScenario,
  eventEvents,
  gaVenueSector,
  sessionSectorFrom,
  testId,
  VENUE_DETAILS,
  venueEvents,
} from '../../src/projection/catalog/catalog-fixtures.js';
import { EventDispatcher } from '../../src/projection/event-dispatcher.js';
import { PingProjection } from '../../src/projection/ping.projection.js';
import { ProjectionExecutor } from '../../src/projection/projection-executor.js';

const url = process.env.MONGO_TEST_URL ?? 'mongodb://127.0.0.1:58017/?directConnection=true';

let client: MongoClient;
let dispatcher: EventDispatcher;
const db = () => client.db('stubb_projector_catalog_it');
const col = (name: string) => db().collection<Record<string, unknown>>(name);
const detail = (id: string) =>
  col(READ_STORE_COLLECTIONS.eventDetail).findOne({ _id: id as never });
const listing = (id: string) =>
  col(READ_STORE_COLLECTIONS.eventListing).findOne({ _id: id as never });
const organizer = (id: string) =>
  col(READ_STORE_COLLECTIONS.organizerEvents).findOne({ _id: id as never });

beforeAll(async () => {
  client = new MongoClient(url);
  await client.connect();
  dispatcher = new EventDispatcher(new ProjectionExecutor(client, db()), new PingProjection());
});

afterAll(async () => {
  await db().dropDatabase();
  await client.close();
});

beforeEach(async () => {
  await db().dropDatabase();
  // Transações no MongoDB precisam das coleções já criadas.
  for (const name of READ_STORE_COLLECTION_NAMES) {
    await db().createCollection(name);
  }
});

describe('CatalogProjection', () => {
  it('CA-28/CA-29: sequência completa grava detalhe e resumos com a mesma version', async () => {
    const s = buildScenario();
    for (const e of s.venue) await dispatcher.dispatch(e);
    for (const e of s.event) await dispatcher.dispatch(e);

    const d = await detail(s.eventId);
    expect(d).toMatchObject({ version: 11, status: 'published', title: 'Hamlet (temporada)' });
    const sessions = d?.sessions as Array<{ id: string; status: string; venue: { name: string } }>;
    expect(sessions.map((x) => x.id)).toEqual([s.sessionB, s.sessionA]);
    // O fan-out do VenueDetailsUpdated (local v4) já tinha sido aplicado antes do agendamento.
    expect(sessions.every((x) => x.venue.name === 'Teatro Aurora Nova')).toBe(true);

    const l = await listing(s.eventId);
    const o = await organizer(s.eventId);
    expect(l?.version).toBe(11);
    expect(o).toMatchObject({
      version: 11,
      status: 'published',
      sessionsCount: 2,
      publishedSessionsCount: 1,
    });
    expect((l?.sessions as unknown[]).length).toBe(1);

    const versions = await col(READ_STORE_COLLECTIONS.aggregateVersions)
      .find({})
      .sort({ _id: 1 })
      .toArray();
    expect(versions.map((v) => [v._id, v.version]).sort()).toEqual(
      [
        [s.eventId, 11],
        [s.venueId, 4],
      ].sort(),
    );
  });

  it('CA-29: evento em rascunho não tem event_listing mas tem organizer_events', async () => {
    const s = buildScenario();
    for (const e of s.venue) await dispatcher.dispatch(e);
    for (const e of s.event.slice(0, 4)) await dispatcher.dispatch(e);
    expect(await listing(s.eventId)).toBeNull();
    expect(await organizer(s.eventId)).toMatchObject({ status: 'draft', sessionsCount: 2 });
  });

  it('CA-26 (idempotência): reaplicar o mesmo evento não altera nada', async () => {
    const s = buildScenario();
    for (const e of s.venue) await dispatcher.dispatch(e);
    for (const e of s.event) await dispatcher.dispatch(e);
    const before = await detail(s.eventId);
    for (const e of [...s.venue, ...s.event]) await dispatcher.dispatch(e);
    expect(await detail(s.eventId)).toEqual(before);
    expect(await col(READ_STORE_COLLECTIONS.processedEvents).countDocuments()).toBe(15);
  });

  it('CA-32: EventDiscarded vira lápide e some dos resumos', async () => {
    const id = testId();
    await dispatcher.dispatch(eventEvents.created(id, 1));
    expect(await organizer(id)).not.toBeNull();
    await dispatcher.dispatch(eventEvents.discarded(id, 2));
    expect(await detail(id)).toEqual({ _id: id, version: 2, status: 'discarded' });
    expect(await organizer(id)).toBeNull();
    expect(await listing(id)).toBeNull();
  });

  it('CA-31: VenueDetailsUpdated propaga para os dois eventos; fuso não muda; reprocesso não regride', async () => {
    const venueId = testId();
    const sector = gaVenueSector(1, 100);
    const registered = venueEvents.registered(venueId, 1);
    await dispatcher.dispatch(registered);
    await dispatcher.dispatch(venueEvents.sectorAdded(venueId, 2, sector));

    const eventIds = [testId(), testId()];
    for (const eventId of eventIds) {
      const ss = sessionSectorFrom(sector);
      await dispatcher.dispatch(eventEvents.created(eventId, 1));
      await dispatcher.dispatch(
        eventEvents.sessionScheduled(eventId, 2, {
          sessionId: testId(),
          venueId,
          startsAt: '2026-12-20T23:00:00.000Z',
          sectors: [ss],
        }),
      );
      await dispatcher.dispatch(
        eventEvents.sessionPublished(eventId, 3, {
          sessionId: ((await detail(eventId))?.sessions as Array<{ id: string }>)[0]!.id,
          venueId,
          startsAt: '2026-12-20T23:00:00.000Z',
          sectors: [ss],
        }),
      );
    }

    const updated = venueEvents.detailsUpdated(venueId, 3, {
      ...VENUE_DETAILS,
      name: 'Casa Nova',
      address: 'Av. Nova, 1',
      city: 'Curitiba',
      state: 'PR',
    });
    await dispatcher.dispatch(updated);

    for (const eventId of eventIds) {
      const d = await detail(eventId);
      const session = (d?.sessions as Array<Record<string, unknown>>)[0]!;
      expect(session.venue).toMatchObject({
        name: 'Casa Nova',
        address: 'Av. Nova, 1',
        city: 'Curitiba',
        state: 'PR',
        cityKey: 'curitiba',
        detailsVersion: 2,
      });
      expect(session.timeZone).toBe('America/Sao_Paulo');
      expect(d?.version).toBe(3);
      const l = await listing(eventId);
      expect((l?.sessions as Array<Record<string, unknown>>)[0]).toMatchObject({
        venue: { name: 'Casa Nova', city: 'Curitiba', state: 'PR' },
        cityKey: 'curitiba',
      });
    }

    // Reprocessar o evento antigo do local (outro eventId, versão já aplicada) não regride.
    await dispatcher.dispatch(venueEvents.registered(venueId, 1));
    const venue = await col(READ_STORE_COLLECTIONS.venues).findOne({ _id: venueId as never });
    expect(venue).toMatchObject({ name: 'Casa Nova', detailsVersion: 2, version: 3 });
    const after = await detail(eventIds[0]!);
    expect((after?.sessions as Array<{ venue: { name: string } }>)[0]?.venue.name).toBe(
      'Casa Nova',
    );
  });

  it('CA-30 (parcial): sessão agendada antes do local fica com venue nulo', async () => {
    const s = buildScenario();
    for (const e of s.event.slice(0, 3)) await dispatcher.dispatch(e);
    const d = await detail(s.eventId);
    expect((d?.sessions as Array<{ venue: unknown }>)[0]?.venue).toBeNull();
    await dispatcher.dispatch(s.venue[0]!);
    const filled = await detail(s.eventId);
    expect((filled?.sessions as Array<{ venue: { name: string } }>)[0]?.venue.name).toBe(
      'Teatro Aurora',
    );
    expect(filled?.version).toBe(3);
  });
});
