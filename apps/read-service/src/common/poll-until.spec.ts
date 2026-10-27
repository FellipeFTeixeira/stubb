import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollUntil } from './poll-until.js';

describe('pollUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns on the first read when done', async () => {
    const read = vi.fn().mockResolvedValue(2);
    const result = await pollUntil(read, (v: number) => v >= 2);
    expect(result).toEqual({ value: 2, reached: true });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('polls every 100 ms by default until done', async () => {
    const read = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValue(2);
    const promise = pollUntil(read, (v: number) => v >= 2);
    await vi.advanceTimersByTimeAsync(250);
    await expect(promise).resolves.toEqual({ value: 2, reached: true });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('gives up after 3 s with the last value and reached=false', async () => {
    const read = vi.fn().mockResolvedValue(1);
    const promise = pollUntil(read, (v: number) => v >= 2);
    await vi.advanceTimersByTimeAsync(3100);
    await expect(promise).resolves.toEqual({ value: 1, reached: false });
  });

  it('honours custom interval and timeout', async () => {
    const read = vi.fn().mockResolvedValue(null);
    const promise = pollUntil(read, (v: null) => v !== null, { intervalMs: 10, timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toEqual({ value: null, reached: false });
    expect(read.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(read.mock.calls.length).toBeLessThanOrEqual(7);
  });
});
