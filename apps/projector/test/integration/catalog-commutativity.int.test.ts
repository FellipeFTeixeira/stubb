import {
  READ_STORE_COLLECTIONS,
  READ_STORE_COLLECTION_NAMES,
  type CatalogDomainEvent,
} from '@stubb/contracts';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildScenario } from '../../src/projection/catalog/catalog-fixtures.js';
import { EventDispatcher } from '../../src/projection/event-dispatcher.js';
import { PingProjection } from '../../src/projection/ping.projection.js';
import { ProjectionExecutor } from '../../src/projection/projection-executor.js';

const url = process.env.MONGO_TEST_URL ?? 'mongodb://127.0.0.1:58017/?directConnection=true';

let client: MongoClient;
const dbName = (label: string) => `stubb_projector_commut_${label}_it`;

beforeAll(async () => {
  client = new MongoClient(url);
  await client.connect();
});

afterAll(async () => {
  for (const label of ['a', 'b', 'c', 'd', 'replay']) {
    await client.db(dbName(label)).dropDatabase();
  }
  await client.close();
});

const MODELS = [
  READ_STORE_COLLECTIONS.eventListing,
  READ_STORE_COLLECTIONS.eventDetail,
  READ_STORE_COLLECTIONS.organizerEvents,
  READ_STORE_COLLECTIONS.venues,
] as const;

async function project(label: string, events: CatalogDomainEvent[]) {
  const db = client.db(dbName(label));
  await db.dropDatabase();
  for (const name of READ_STORE_COLLECTION_NAMES) await db.createCollection(name);
  const dispatcher = new EventDispatcher(new ProjectionExecutor(client, db), new PingProjection());
  for (const event of events) await dispatcher.dispatch(event);
  const result: Record<string, unknown[]> = {};
  for (const name of MODELS) {
    result[name] = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
  }
  return result;
}

describe('CA-30: o local é comutativo com o evento', () => {
  const s = buildScenario();
  const [vReg, vSec1, vSec2, vUpd] = s.venue as [
    CatalogDomainEvent,
    CatalogDomainEvent,
    CatalogDomainEvent,
    CatalogDomainEvent,
  ];
  const [eCreated, eUpd, eSched1, eSched2, ...eRest] = s.event as [
    CatalogDomainEvent,
    CatalogDomainEvent,
    CatalogDomainEvent,
    CatalogDomainEvent,
    ...CatalogDomainEvent[],
  ];

  // (a) o local inteiro antes de qualquer sessão
  const orderA = [...s.venue, ...s.event];
  // (b) o evento inteiro antes do local
  const orderB = [...s.event, ...s.venue];
  // (c) VenueDetailsUpdated antes do SessionScheduled mais antigo
  const orderC = [vReg, vSec1, vSec2, vUpd, eCreated, eUpd, eSched1, eSched2, ...eRest];
  // (d) intercalado: uma sessão com o local em v1, outra depois das edições
  const orderD = [eCreated, vReg, eUpd, eSched1, vSec1, vSec2, eSched2, vUpd, ...eRest];

  it('as quatro ordens produzem os mesmos quatro read models', async () => {
    const a = await project('a', orderA);
    const b = await project('b', orderB);
    const c = await project('c', orderC);
    const d = await project('d', orderD);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(d).toEqual(a);

    // Sanidade: o resultado não é vazio e traz o snapshot final do local.
    const detail = a[READ_STORE_COLLECTIONS.eventDetail]?.[0] as {
      sessions: Array<{ venue: { name: string; detailsVersion: number } }>;
    };
    expect(detail.sessions.every((x) => x.venue.name === 'Teatro Aurora Nova')).toBe(true);
    expect(detail.sessions.every((x) => x.venue.detailsVersion === 2)).toBe(true);
    expect(a[READ_STORE_COLLECTIONS.eventListing]).toHaveLength(1);
    expect(a[READ_STORE_COLLECTIONS.organizerEvents]).toHaveLength(1);
    expect(a[READ_STORE_COLLECTIONS.venues]).toHaveLength(1);
  });

  it('regra 6: apagar os read models e reprocessar reproduz os documentos (replay)', async () => {
    const first = await project('replay', orderA);
    const second = await project('replay', orderA);
    expect(second).toEqual(first);
  });

  it('enquanto o local não chega, a sessão fica com venue nulo e fora da vitrine pública', async () => {
    // Só os eventos do Evento, sem nenhum evento do local.
    const result = await project('a', s.event);
    const detail = result[READ_STORE_COLLECTIONS.eventDetail]?.[0] as {
      sessions: Array<{ venue: unknown }>;
    };
    expect(detail.sessions.every((x) => x.venue === null)).toBe(true);
    const listing = result[READ_STORE_COLLECTIONS.eventListing]?.[0] as {
      sessions: Array<{ venue: unknown; cityKey: unknown }>;
    };
    expect(listing.sessions.every((x) => x.venue === null && x.cityKey === null)).toBe(true);
  });
});
