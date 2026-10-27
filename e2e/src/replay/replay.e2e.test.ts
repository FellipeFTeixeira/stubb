import { diagnosticsRoutes, READ_STORE_COLLECTIONS, type GetPingResponse } from '@stubb/contracts';
import { isDeepStrictEqual } from 'node:util';
import type { Db } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { createPublishedEvent } from '../support/catalog.ts';
import { api } from '../support/http.ts';
import { withMongo } from '../support/mongo.ts';
import { createPing, incrementPing } from '../support/pings.ts';
import { replay } from './replay.ts';

const READ_TIMEOUT_MS = 30000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readAtVersion(id: string, minVersion: number) {
  const deadline = Date.now() + READ_TIMEOUT_MS;
  for (;;) {
    const res = await api<GetPingResponse>(
      'GET',
      `${diagnosticsRoutes.getPing(id)}?min_version=${minVersion}`,
    );
    if (res.status === 200 && res.body.minVersionReached) return res.body;
    if (Date.now() > deadline) throw new Error(`ping ${id} não chegou à versão ${minVersion}`);
  }
}

interface CatalogSnapshot {
  eventListing: unknown;
  eventDetail: unknown;
  organizerEvents: unknown;
  venues: unknown;
}

async function readCatalog(db: Db, eventId: string, venueId: string): Promise<CatalogSnapshot> {
  const byId = (name: string, id: string) => db.collection(name).findOne({ _id: id as never });
  return {
    eventListing: await byId(READ_STORE_COLLECTIONS.eventListing, eventId),
    eventDetail: await byId(READ_STORE_COLLECTIONS.eventDetail, eventId),
    organizerEvents: await byId(READ_STORE_COLLECTIONS.organizerEvents, eventId),
    venues: await byId(READ_STORE_COLLECTIONS.venues, venueId),
  };
}

/**
 * Espera o projector reconstruir os documentos: o replay termina antes de ele alcançar o fim
 * do tópico, então com `target` espera ficarem idênticos a ele (ou devolve o último estado).
 */
async function waitCatalog(
  eventId: string,
  venueId: string,
  target?: CatalogSnapshot,
): Promise<CatalogSnapshot> {
  const deadline = Date.now() + READ_TIMEOUT_MS;
  for (;;) {
    const snapshot = await withMongo((db) => readCatalog(db, eventId, venueId));
    const complete = Object.values(snapshot).every((doc) => doc !== null);
    if (target ? isDeepStrictEqual(snapshot, target) : complete) return snapshot;
    if (Date.now() > deadline) {
      if (target) return snapshot;
      throw new Error('read models do Catalog não foram montados');
    }
    await sleep(500);
  }
}

describe('replay', () => {
  it('CA-31/CA-52: apagar os read models e reprocessar os tópicos reproduz os mesmos documentos', async () => {
    const created = await createPing();
    const id = created.body.id;
    await incrementPing(id);
    await incrementPing(id);
    const snapshot = await readAtVersion(id, 3);
    expect(snapshot.ping.version).toBe(3);

    const { event, venue, version } = await createPublishedEvent();
    const before = await waitCatalog(event.id, venue.id);
    expect(before.eventDetail).toMatchObject({ version, status: 'published' });

    await replay();

    const rebuilt = await readAtVersion(id, 3);
    expect(rebuilt.ping).toEqual(snapshot.ping);
    const after = await waitCatalog(event.id, venue.id, before);
    expect(after.eventListing).toEqual(before.eventListing);
    expect(after.eventDetail).toEqual(before.eventDetail);
    expect(after.organizerEvents).toEqual(before.organizerEvents);
    expect(after.venues).toEqual(before.venues);
  });
});
