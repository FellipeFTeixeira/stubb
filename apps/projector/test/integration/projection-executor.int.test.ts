import { randomUUID } from 'node:crypto';
import type { AnyEventEnvelope } from '@stubb/contracts';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectionExecutor } from '../../src/projection/projection-executor.js';
import { ProjectionGapError } from '../../src/projection/projection-gap.error.js';

const url = process.env.MONGO_TEST_URL ?? 'mongodb://127.0.0.1:58017/?directConnection=true';

let client: MongoClient;
let executor: ProjectionExecutor;
const db = () => client.db('stubb_projector_executor_it');
const processedEvents = () => db().collection<{ _id: string }>('processed_events');
const versions = () =>
  db().collection<{ _id: string; aggregateType: string; version: number }>('aggregate_versions');
const target = () => db().collection<{ _id: string }>('target');

function envelope(aggregateId: string, aggregateVersion: number): AnyEventEnvelope {
  return {
    eventId: randomUUID(),
    eventType: 'Something',
    schemaVersion: 1,
    aggregateType: 'Thing',
    aggregateId,
    aggregateVersion,
    occurredAt: '2026-10-26T12:00:00.000Z',
    correlationId: null,
    causationId: null,
    payload: {},
  };
}

beforeAll(async () => {
  client = new MongoClient(url);
  await client.connect();
  executor = new ProjectionExecutor(client, db());
  for (const name of ['processed_events', 'aggregate_versions', 'target']) {
    await db()
      .createCollection(name)
      .catch(() => undefined);
  }
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await processedEvents().deleteMany({});
  await versions().deleteMany({});
  await target().deleteMany({});
});

describe('ProjectionExecutor', () => {
  it('CA-26: sucesso grava processed_events, aggregate_versions e o read model', async () => {
    const id = randomUUID();
    const e = envelope(id, 1);
    await executor.run(e, async (tx) => {
      await target().insertOne({ _id: id }, { session: tx.session });
    });
    expect(await processedEvents().findOne({ _id: e.eventId })).not.toBeNull();
    expect(await versions().findOne({ _id: id })).toEqual({
      _id: id,
      aggregateType: 'Thing',
      version: 1,
    });
    expect(await target().countDocuments()).toBe(1);
  });

  it('CA-26: evento repetido (mesmo eventId) não chama apply', async () => {
    const id = randomUUID();
    const e = envelope(id, 1);
    await executor.run(e, () => Promise.resolve());
    const apply = vi.fn(() => Promise.resolve());
    await executor.run(e, apply);
    expect(apply).not.toHaveBeenCalled();
    expect(await processedEvents().countDocuments()).toBe(1);
  });

  it('CA-26: versão já aplicada com eventId novo é registrada sem chamar apply', async () => {
    const id = randomUUID();
    await executor.run(envelope(id, 1), () => Promise.resolve());
    const dup = envelope(id, 1);
    const apply = vi.fn(() => Promise.resolve());
    await executor.run(dup, apply);
    expect(apply).not.toHaveBeenCalled();
    expect(await processedEvents().findOne({ _id: dup.eventId })).not.toBeNull();
    expect((await versions().findOne({ _id: id }))?.version).toBe(1);
  });

  it('CA-26: lacuna lança ProjectionGapError e nada é gravado', async () => {
    const id = randomUUID();
    await executor.run(envelope(id, 1), () => Promise.resolve());
    const gap = envelope(id, 3);
    const apply = vi.fn(() => Promise.resolve());
    await expect(executor.run(gap, apply)).rejects.toBeInstanceOf(ProjectionGapError);
    expect(apply).not.toHaveBeenCalled();
    expect(await processedEvents().findOne({ _id: gap.eventId })).toBeNull();
    expect((await versions().findOne({ _id: id }))?.version).toBe(1);
  });

  it('CA-26: primeiro evento do agregado com versão 2 é lacuna', async () => {
    const e = envelope(randomUUID(), 2);
    await expect(executor.run(e, () => Promise.resolve())).rejects.toBeInstanceOf(
      ProjectionGapError,
    );
    expect(await processedEvents().countDocuments()).toBe(0);
    expect(await versions().countDocuments()).toBe(0);
  });

  it('CA-26: falha dentro de apply desfaz processed_events, aggregate_versions e o read model', async () => {
    const id = randomUUID();
    const e = envelope(id, 1);
    await expect(
      executor.run(e, async (tx) => {
        await target().insertOne({ _id: id }, { session: tx.session });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await processedEvents().countDocuments()).toBe(0);
    expect(await versions().countDocuments()).toBe(0);
    expect(await target().countDocuments()).toBe(0);
  });
});
