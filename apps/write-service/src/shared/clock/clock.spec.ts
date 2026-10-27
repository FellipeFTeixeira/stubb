import { describe, expect, it } from 'vitest';
import { Clock } from './clock.js';

describe('Clock', () => {
  it('devolve o instante atual', () => {
    const before = Date.now();
    const now = new Clock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
