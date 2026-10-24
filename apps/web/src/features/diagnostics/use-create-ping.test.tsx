import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, jsonResponse, wrapperFor } from '@/test/render';
import { useCreatePing } from './use-create-ping';

const ID = '0199c1a2-7b3e-7c4d-8a5f-123456789abc';
const KEY = '0199c1a2-7b3e-7c4d-8a5f-aaaaaaaaaaaa';

afterEach(() => vi.unstubAllGlobals());

const keyOf = (call: unknown) =>
  ((call as [string, RequestInit])[1].headers as Record<string, string>)['Idempotency-Key'];

describe('useCreatePing', () => {
  it('repete após erro de rede reusando a mesma Idempotency-Key', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(202, { id: ID, version: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatePing(), {
      wrapper: wrapperFor(createTestQueryClient()),
    });

    result.current.mutate({ label: 'abc', idempotencyKey: KEY });
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(keyOf(fetchMock.mock.calls[0])).toBe(KEY);
    expect(keyOf(fetchMock.mock.calls[1])).toBe(KEY);
  });

  it('não repete em 409', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(409, { statusCode: 409 })));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatePing(), {
      wrapper: wrapperFor(createTestQueryClient()),
    });

    result.current.mutate({ label: 'abc', idempotencyKey: KEY });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
