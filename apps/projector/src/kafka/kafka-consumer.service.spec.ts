import { describe, expect, it, vi } from 'vitest';
import type { EventDispatcher } from '../projection/event-dispatcher.js';
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

function message(value: string): ConsumedMessage {
  return {
    topic: 't',
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
});
