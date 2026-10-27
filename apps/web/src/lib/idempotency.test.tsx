import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useIdempotencyKey } from './idempotency';

describe('useIdempotencyKey', () => {
  it('mesma chave para o mesmo payload, mesmo com chaves em outra ordem', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const a = result.current.keyFor({ name: 'x', nested: { a: 1, b: 2 } });
    const b = result.current.keyFor({ nested: { b: 2, a: 1 }, name: 'x' });
    expect(b).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('chave nova depois de mudar o payload e depois do reset', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const a = result.current.keyFor({ name: 'x' });
    const b = result.current.keyFor({ name: 'y' });
    expect(b).not.toBe(a);
    expect(result.current.keyFor({ name: 'y' })).toBe(b);
    result.current.reset();
    expect(result.current.keyFor({ name: 'y' })).not.toBe(b);
  });
});
