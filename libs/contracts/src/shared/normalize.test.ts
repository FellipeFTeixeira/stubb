import { describe, expect, it } from 'vitest';
import { normalizeSearchKey } from '../index.js';

describe('normalizeSearchKey', () => {
  it.each(['  São Paulo ', 'SAO PAULO'])('%j vira "sao paulo"', (v) => {
    expect(normalizeSearchKey(v)).toBe('sao paulo');
  });
  it('remove acentos variados', () => {
    expect(normalizeSearchKey('Hámlet Ç')).toBe('hamlet c');
  });
});
