import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getJson } from '@/api/http';
import { createFakeApi } from '@/test/fake-api';
import { createTestQueryClient, wrapperFor } from '@/test/render';
import { z } from 'zod';
import {
  PROJECTION_POLL_INTERVAL_MS,
  PROJECTION_WAIT_BUDGET_MS,
  useVersionedQuery,
} from './read-your-writes';

const schema = z.object({ version: z.number(), minVersionReached: z.boolean() });

// O "servidor" só alcança a versão pedida depois de `projectedAfterMs`.
function setup(projectedAfterMs: number | null) {
  const api = createFakeApi();
  let elapsed = 0;
  api.on('GET', '/api/thing', ({ query }) => {
    const wanted = Number(query.min_version ?? 0);
    const reached = projectedAfterMs !== null && elapsed >= projectedAfterMs;
    return { status: 200, body: { version: reached ? wanted : 0, minVersionReached: reached } };
  });
  api.install();
  return {
    api,
    advance: async (ms: number) => {
      elapsed += ms;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    },
  };
}

function render(minVersion: number | undefined, budgetMs?: number) {
  return renderHook(
    (props: { minVersion: number | undefined }) =>
      useVersionedQuery({
        queryKey: ['thing'],
        queryFn: async (mv) => {
          const url = mv === undefined ? '/api/thing' : `/api/thing?min_version=${mv}`;
          const result = await getJson(url, schema);
          return result.status === 'found'
            ? result.data
            : { version: 0, minVersionReached: result.minVersionReached };
        },
        minVersion: props.minVersion,
        budgetMs,
      }),
    {
      wrapper: wrapperFor(createTestQueryClient()),
      initialProps: { minVersion },
    },
  );
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useVersionedQuery', () => {
  it('sem minVersion fica idle e não faz polling', async () => {
    const { api, advance } = setup(0);
    const { result } = render(undefined);
    await advance(50);
    expect(result.current.status).toBe('idle');
    await advance(2000);
    expect(api.calls).toHaveLength(1);
  });

  it('projeção chega em 600 ms: waiting depois synced, com polling de 250 ms', async () => {
    const { api, advance } = setup(600);
    const { result } = render(2);
    await advance(10);
    expect(result.current.status).toBe('waiting');
    await advance(PROJECTION_POLL_INTERVAL_MS * 4);
    expect(result.current.status).toBe('synced');
    const calls = api.calls.length;
    expect(calls).toBeGreaterThanOrEqual(2);
    await advance(2000);
    expect(api.calls).toHaveLength(calls);
    expect(result.current.query.data?.version).toBe(2);
  });

  it('nunca chega: timed-out aos 10 s e o polling para; restart volta a waiting', async () => {
    const { api, advance } = setup(null);
    const { result } = render(2);
    await advance(PROJECTION_WAIT_BUDGET_MS - 500);
    expect(result.current.status).toBe('waiting');
    await advance(1000);
    expect(result.current.status).toBe('timed-out');

    const callsAtTimeout = api.calls.length;
    await advance(3000);
    expect(api.calls).toHaveLength(callsAtTimeout);

    act(() => result.current.restart());
    await advance(10);
    expect(result.current.status).toBe('waiting');
    expect(api.calls.length).toBeGreaterThan(callsAtTimeout);
    await advance(PROJECTION_WAIT_BUDGET_MS + 500);
    expect(result.current.status).toBe('timed-out');
  });

  it('budgetMs infinito nunca estoura', async () => {
    const { advance } = setup(null);
    const { result } = render(2, Infinity);
    await advance(60_000);
    expect(result.current.status).toBe('waiting');
  });

  it('ao sincronizar, semeia a chave sem min_version', async () => {
    const { advance } = setup(0);
    const client = createTestQueryClient();
    const { result } = renderHook(
      () =>
        useVersionedQuery({
          queryKey: ['seed'],
          queryFn: async () => {
            const result = await getJson('/api/thing?min_version=3', schema);
            return result.status === 'found'
              ? result.data
              : { version: 0, minVersionReached: false };
          },
          minVersion: 3,
        }),
      { wrapper: wrapperFor(client) },
    );
    await advance(50);
    expect(result.current.status).toBe('synced');
    expect(client.getQueryData(['seed', null])).toEqual({ version: 3, minVersionReached: true });
  });
});
