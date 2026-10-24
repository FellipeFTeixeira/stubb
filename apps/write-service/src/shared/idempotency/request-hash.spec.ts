import { describe, expect, it } from 'vitest';
import { hashRequest } from './request-hash.js';

describe('hashRequest', () => {
  it('mesmo input dá o mesmo hash SHA-256 hex', () => {
    const a = hashRequest('POST', '/api/diagnostics/pings', { label: 'a' });
    expect(a).toBe(hashRequest('POST', '/api/diagnostics/pings', { label: 'a' }));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('path ou corpo diferente dá outro hash', () => {
    const base = hashRequest('POST', '/api/diagnostics/pings', { label: 'a' });
    expect(hashRequest('POST', '/api/diagnostics/pings/x/increment', { label: 'a' })).not.toBe(
      base,
    );
    expect(hashRequest('POST', '/api/diagnostics/pings', { label: 'b' })).not.toBe(base);
  });
});
