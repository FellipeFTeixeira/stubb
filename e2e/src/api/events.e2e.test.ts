import { PingCreatedV1Schema } from '@stubb/contracts';
import { describe, expect, it } from 'vitest';
import { collectMessages } from '../support/kafka.ts';
import { createPing, incrementPing } from '../support/pings.ts';

describe('eventos no Kafka', () => {
  it('CA-19: PingCreated chega com key, headers e envelope válido', async () => {
    const created = await createPing();
    const id = created.body.id;
    const messages = await collectMessages((all) => all.some((m) => m.key === id));
    const message = messages.find((m) => m.key === id);

    expect(message).toBeDefined();
    expect(message?.headers.eventType).toBe('PingCreated');
    expect(message?.headers.eventId).toBeTruthy();
    const raw = JSON.parse(message?.value ?? '') as Record<string, unknown>;
    const event = PingCreatedV1Schema.parse(raw);
    expect(event.eventId).toBe(message?.headers.eventId);
    expect(event.aggregateId).toBe(id);
    expect(raw.correlationId).toBeNull();
    expect(raw.causationId).toBeNull();
  });

  it('CA-20: eventos do mesmo ping ficam na mesma partição, em ordem de versão', async () => {
    const created = await createPing();
    const id = created.body.id;
    await incrementPing(id);
    await incrementPing(id);

    const messages = await collectMessages((all) => all.filter((m) => m.key === id).length >= 3);
    const mine = messages.filter((m) => m.key === id).sort((a, b) => a.offset - b.offset);

    expect(mine).toHaveLength(3);
    expect(new Set(mine.map((m) => m.partition)).size).toBe(1);
    const versions = mine.map(
      (m) => (JSON.parse(m.value) as { aggregateVersion: number }).aggregateVersion,
    );
    expect(versions).toEqual([1, 2, 3]);
  });
});
