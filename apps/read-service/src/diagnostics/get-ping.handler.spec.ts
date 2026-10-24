import type { PingView } from '@stubb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GetPingHandler } from './get-ping.handler.js';
import { GetPingQuery } from './get-ping.query.js';
import type { PingReadRepository } from './ping-read.repository.js';

const ID = '0190a0a0-0000-7000-8000-000000000001';

function ping(version: number): PingView {
  return {
    id: ID,
    label: 'x',
    count: version - 1,
    version,
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
  };
}

function handlerWith(findById: ReturnType<typeof vi.fn>): GetPingHandler {
  return new GetPingHandler({ findById } as unknown as PingReadRepository);
}

describe('GetPingHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves on the first read when the version is already there', async () => {
    const findById = vi.fn().mockResolvedValue(ping(1));
    const result = await handlerWith(findById).execute(new GetPingQuery(ID, 1));
    expect(result).toEqual({ found: true, ping: ping(1), minVersionReached: true });
    expect(findById).toHaveBeenCalledTimes(1);
  });

  it('reads once without min_version', async () => {
    const findById = vi.fn().mockResolvedValue(null);
    const result = await handlerWith(findById).execute(new GetPingQuery(ID));
    expect(result).toEqual({ found: false });
    expect(findById).toHaveBeenCalledTimes(1);
  });

  it('polls until the document reaches min_version', async () => {
    const findById = vi
      .fn()
      .mockResolvedValueOnce(ping(1))
      .mockResolvedValueOnce(ping(1))
      .mockResolvedValue(ping(2));
    const promise = handlerWith(findById).execute(new GetPingQuery(ID, 2));
    await vi.advanceTimersByTimeAsync(300);
    await expect(promise).resolves.toEqual({
      found: true,
      ping: ping(2),
      minVersionReached: true,
    });
    expect(findById).toHaveBeenCalledTimes(3);
  });

  it('returns the current state with reached=false after 3 s', async () => {
    const findById = vi.fn().mockResolvedValue(ping(1));
    const promise = handlerWith(findById).execute(new GetPingQuery(ID, 2));
    await vi.advanceTimersByTimeAsync(3100);
    await expect(promise).resolves.toEqual({
      found: true,
      ping: ping(1),
      minVersionReached: false,
    });
  });

  it('returns not found after 3 s when the document never appears', async () => {
    const findById = vi.fn().mockResolvedValue(null);
    const promise = handlerWith(findById).execute(new GetPingQuery(ID, 1));
    await vi.advanceTimersByTimeAsync(3100);
    await expect(promise).resolves.toEqual({ found: false });
  });
});
