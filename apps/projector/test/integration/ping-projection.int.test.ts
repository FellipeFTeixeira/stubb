import { randomUUID } from 'node:crypto';
import type { PingCreatedV1, PingIncrementedV1 } from '@stubb/contracts';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EventDispatcher } from '../../src/projection/event-dispatcher.js';
import { PingProjection } from '../../src/projection/ping.projection.js';
import { ProjectionExecutor } from '../../src/projection/projection-executor.js';
import { ProjectionGapError } from '../../src/projection/projection-gap.error.js';

// A porta 57017 do Plan cai num range reservado do Windows; o default usa 58017 e MONGO_TEST_URL permite trocar.
const url = process.env.MONGO_TEST_URL ?? 'mongodb://127.0.0.1:58017/?directConnection=true';

let client: MongoClient;
let dispatcher: EventDispatcher;
const db = () => client.db('stubb_projector_it');
const pings = () => db().collection<{ _id: string }>('pings');
const processedEvents = () => db().collection<{ _id: string }>('processed_events');
const versions = () => db().collection<{ _id: string; version: number }>('aggregate_versions');

function created(aggregateId: string, eventId = randomUUID()): PingCreatedV1 {
  return {
    eventId,
    eventType: 'PingCreated',
    schemaVersion: 1,
    aggregateType: 'Ping',
    aggregateId,
    aggregateVersion: 1,
    occurredAt: '2026-10-24T12:00:00.000Z',
    correlationId: null,
    causationId: null,
    payload: { label: 'abc' },
  };
}

function incremented(
  aggregateId: string,
  version: number,
  eventId = randomUUID(),
): PingIncrementedV1 {
  return {
    eventId,
    eventType: 'PingIncremented',
    schemaVersion: 1,
    aggregateType: 'Ping',
    aggregateId,
    aggregateVersion: version,
    occurredAt: `2026-10-24T12:00:0${version}.000Z`,
    correlationId: null,
    causationId: null,
    payload: { count: version - 1 },
  };
}

beforeAll(async () => {
  client = new MongoClient(url);
  await client.connect();
  dispatcher = new EventDispatcher(new ProjectionExecutor(client, db()), new PingProjection());
  // Transações não criam coleções implicitamente em todas as versões; garante que existem.
  for (const name of ['pings', 'processed_events', 'aggregate_versions']) {
    await db()
      .createCollection(name)
      .catch(() => undefined);
  }
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await pings().deleteMany({});
  await processedEvents().deleteMany({});
  await versions().deleteMany({});
});

describe('Ping via EventDispatcher + ProjectionExecutor', () => {
  it('CA-21: Created v1 + Incremented v2 geram o documento', async () => {
    const id = randomUUID();
    const c = created(id);
    const i = incremented(id, 2);
    await dispatcher.dispatch(c);
    await dispatcher.dispatch(i);
    const doc = await pings().findOne({ _id: id });
    expect(doc).toMatchObject({ label: 'abc', count: 1, version: 2 });
    expect(doc).toMatchObject({
      createdAt: new Date(c.occurredAt),
      updatedAt: new Date(i.occurredAt),
    });
    expect(await processedEvents().countDocuments()).toBe(2);
    expect((await versions().findOne({ _id: id }))?.version).toBe(2);
  });

  it('CA-22: mesmo eventId duas vezes não altera nada', async () => {
    const id = randomUUID();
    const c = created(id);
    await dispatcher.dispatch(c);
    const before = await pings().findOne({ _id: id });
    await dispatcher.dispatch(c);
    expect(await pings().findOne({ _id: id })).toEqual(before);
    expect(await processedEvents().countDocuments()).toBe(1);
  });

  it('CA-24 (a): versão já aplicada com eventId novo é registrada sem alterar o documento', async () => {
    const id = randomUUID();
    await dispatcher.dispatch(created(id));
    await dispatcher.dispatch(incremented(id, 2));
    const before = await pings().findOne({ _id: id });
    const dup = incremented(id, 2);
    await dispatcher.dispatch(dup);
    expect(await pings().findOne({ _id: id })).toEqual(before);
    expect(await processedEvents().findOne({ _id: dup.eventId })).not.toBeNull();
  });

  it('CA-24 (b): lacuna rejeita e faz rollback', async () => {
    const id = randomUUID();
    await dispatcher.dispatch(created(id));
    await dispatcher.dispatch(incremented(id, 2));
    const before = await pings().findOne({ _id: id });
    const gap = incremented(id, 4);
    await expect(dispatcher.dispatch(gap)).rejects.toBeInstanceOf(ProjectionGapError);
    expect(await pings().findOne({ _id: id })).toEqual(before);
    expect(await processedEvents().findOne({ _id: gap.eventId })).toBeNull();
  });

  it('CA-24 (c): Incremented sem documento rejeita e nada é gravado', async () => {
    await expect(dispatcher.dispatch(incremented(randomUUID(), 2))).rejects.toBeInstanceOf(
      ProjectionGapError,
    );
    expect(await pings().countDocuments()).toBe(0);
    expect(await processedEvents().countDocuments()).toBe(0);
    expect(await versions().countDocuments()).toBe(0);
  });

  it('CA-26: Ping existente sem aggregate_versions (volume antigo) é lacuna até o replay', async () => {
    const id = randomUUID();
    await pings().insertOne({ _id: id, label: 'abc', count: 0, version: 1 } as never);
    await expect(dispatcher.dispatch(incremented(id, 2))).rejects.toBeInstanceOf(
      ProjectionGapError,
    );
  });
});
