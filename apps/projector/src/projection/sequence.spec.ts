import { describe, expect, it } from 'vitest';
import { decideProjection } from './sequence.js';

describe('decideProjection', () => {
  it.each([
    [1, null, 'apply'],
    [2, null, 'gap'],
    [1, 1, 'already-applied'],
    [1, 3, 'already-applied'],
    [2, 2, 'already-applied'],
    [3, 2, 'apply'],
    [4, 2, 'gap'],
  ] as const)('v%i com atual %s -> %s', (version, current, expected) => {
    expect(decideProjection(version, current)).toBe(expected);
  });
});
