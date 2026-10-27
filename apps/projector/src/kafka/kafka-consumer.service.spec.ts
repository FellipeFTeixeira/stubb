import { describe, expect, it, vi } from 'vitest';
import type { EventDispatcher } from '../projection/event-dispatcher.js';
import { TOPIC_REGISTRY } from '../projection/topic-registry.js';
import type { ConsumedMessage, EventConsumer } from './event-consumer.js';
import { KafkaConsumerService } from './kafka-consumer.service.js';

const event = {
  eventId: '0197a0a0-0000-7000-8000-000000000001',
  eventType: 'PingCreated',
  schemaVersion: 1,
  aggregateType: 'Ping',
  aggregateId: '0197a0a0-0000-7000-8000-000000000002',
  aggregateVersion: 1,
  occurredAt: '2026-10-24T12:00:00.000Z',
  correlationId: null,
  causationId: null,
  payload: { label: 'abc' },
};

function message(value: string, topic = 'diagnostics.events'): ConsumedMessage {
  return {
    topic,
    partition: 0,
    offset: '5',
    key: 'k',
    value: Buffer.from(value),
    headers: {},
  };
}

function setup(opts: { dispatch?: () => Promise<void>; commit?: () => Promise<void> } = {}) {
  const calls: string[] = [];
  const commit = vi.fn(async () => {
    calls.push('commit');
    await opts.commit?.();
  });
  const consumer = { commit } as unknown as EventConsumer;
  const dispatch = vi.fn(async () => {
    await opts.dispatch?.();
    calls.push('dispatch');
  });
  const dispatcher = { dispatch } as unknown as EventDispatcher;
  const exit = vi.fn();
  const service = new KafkaConsumerService(consumer, dispatcher, exit);
  vi.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
  return { service, commit, dispatch, exit, calls };
}

describe('KafkaConsumerService.handle', () => {
  it('(1) dispatch resolve antes do commit', async () => {
    const { service, commit, exit, calls } = setup();
    const m = message(JSON.stringify(event));
    await service.handle(m);
    expect(calls).toEqual(['dispatch', 'commit']);
    expect(commit).toHaveBeenCalledWith(m);
    expect(exit).not.toHaveBeenCalled();
  });

  it('(2) dispatch rejeita: sem commit e exit(1)', async () => {
    const { service, commit, exit } = setup({ dispatch: () => Promise.reject(new Error('x')) });
    await service.handle(message(JSON.stringify(event)));
    expect(commit).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('(3) JSON inválido: sem dispatch, sem commit, exit(1)', async () => {
    const { service, commit, dispatch, exit } = setup();
    await service.handle(message('{not json'));
    expect(dispatch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('(4) envelope fora do schema: sem dispatch, sem commit, exit(1)', async () => {
    const { service, commit, dispatch, exit } = setup();
    await service.handle(message(JSON.stringify({ ...event, schemaVersion: 2 })));
    expect(dispatch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('(5) commit rejeita: exit(1)', async () => {
    const { service, exit } = setup({ commit: () => Promise.reject(new Error('x')) });
    await service.handle(message(JSON.stringify(event)));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('(6) tópico fora do registro: sem dispatch, sem commit, exit(1)', async () => {
    const { service, commit, dispatch, exit } = setup();
    await service.handle(message(JSON.stringify(event), 'unknown.events'));
    expect(dispatch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('(7) eventType desconhecido no tópico registrado: sem dispatch, sem commit, exit(1)', async () => {
    const { service, commit, dispatch, exit } = setup();
    await service.handle(message(JSON.stringify({ ...event, eventType: 'PingExploded' })));
    expect(dispatch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('(8) assina todos os tópicos do registro', async () => {
    const subscribe = vi.fn(() => Promise.resolve());
    const consumer = {
      connect: vi.fn(() => Promise.resolve()),
      subscribe,
      run: vi.fn(() => Promise.resolve()),
    } as unknown as EventConsumer;
    const service = new KafkaConsumerService(consumer, {} as EventDispatcher, vi.fn());
    await service.onApplicationBootstrap();
    expect(subscribe).toHaveBeenCalledWith(Object.keys(TOPIC_REGISTRY));
    expect(Object.keys(TOPIC_REGISTRY)).toContain('diagnostics.events');
    expect(Object.keys(TOPIC_REGISTRY)).toContain('catalog.events');
  });

  it('(9) catalog.events: envelope do Catalog é despachado e confirmado', async () => {
    const { service, commit, dispatch, exit, calls } = setup();
    const venueRegistered = {
      eventId: '0197a0a0-0000-7000-8000-000000000003',
      eventType: 'VenueRegistered',
      schemaVersion: 1,
      aggregateType: 'Venue',
      aggregateId: '0197a0a0-0000-7000-8000-000000000004',
      aggregateVersion: 1,
      occurredAt: '2026-10-24T12:00:00.000Z',
      correlationId: null,
      causationId: null,
      payload: {
        organizerId: '0197a0a0-0000-7000-8000-000000000005',
        name: 'Teatro',
        address: 'Rua A, 1',
        city: 'Porto Alegre',
        state: 'RS',
        timeZone: 'America/Sao_Paulo',
      },
    };
    await service.handle(message(JSON.stringify(venueRegistered), 'catalog.events'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['dispatch', 'commit']);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it('(10) catalog.events: eventType de outro tópico é rejeitado', async () => {
    const { service, commit, dispatch, exit } = setup();
    await service.handle(message(JSON.stringify(event), 'catalog.events'));
    expect(dispatch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
