import { describe, expect, it } from 'vitest';
import { Ping } from './ping.aggregate.js';
import { PingCreatedEvent, PingIncrementedEvent } from './ping.events.js';

const id = '0190f1a2-0000-7000-8000-000000000001';
const now = new Date('2026-10-24T12:00:00.000Z');

describe('Ping aggregate', () => {
  it('create gera versão 1, count 0 e um evento com aggregateVersion 1', () => {
    const ping = Ping.create(id, 'primeiro', now);
    expect(ping.version).toBe(1);
    expect(ping.count).toBe(0);
    const events = ping.getUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(PingCreatedEvent);
    expect(events[0]).toMatchObject({ pingId: id, label: 'primeiro', aggregateVersion: 1 });
  });

  it('rehydrate + dois increments gera versão 3, count 2 e eventos 2 e 3', () => {
    const ping = Ping.rehydrate({
      id,
      label: 'x',
      count: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    expect(ping.getUncommittedEvents()).toHaveLength(0);
    ping.increment(now);
    ping.increment(now);
    expect(ping.version).toBe(3);
    expect(ping.count).toBe(2);
    const events = ping.getUncommittedEvents();
    expect(events.map((e) => e.aggregateVersion)).toEqual([2, 3]);
    expect(events.every((e) => e instanceof PingIncrementedEvent)).toBe(true);
    expect(events.map((e) => (e as PingIncrementedEvent).count)).toEqual([1, 2]);
  });

  it('uncommit limpa os eventos', () => {
    const ping = Ping.create(id, 'x', now);
    ping.uncommit();
    expect(ping.getUncommittedEvents()).toHaveLength(0);
  });
});
