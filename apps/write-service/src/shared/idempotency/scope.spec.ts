import { describe, expect, it } from 'vitest';
import { idempotencyScope } from './scope.js';

describe('idempotencyScope', () => {
  const template = 'POST /api/catalog/venues';

  it('prefixa o ator quando há ator', () => {
    expect(idempotencyScope(template, 'user-1')).toBe('user-1 POST /api/catalog/venues');
  });

  it('devolve só o template sem ator', () => {
    expect(idempotencyScope(template)).toBe(template);
  });

  it('atores diferentes geram escopos diferentes', () => {
    expect(idempotencyScope(template, 'a')).not.toBe(idempotencyScope(template, 'b'));
  });
});
