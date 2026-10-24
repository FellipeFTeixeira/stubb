import { describe, expect, it } from 'vitest';
import { decideProjection } from './sequence.js';

describe('decideProjection', () => {
  it.each([
    ['PingCreated', 1, null, 'apply'],
    ['PingCreated', 1, 1, 'already-applied'],
    ['PingCreated', 1, 3, 'already-applied'],
    ['PingIncremented', 2, 1, 'apply'],
    ['PingIncremented', 2, 2, 'already-applied'],
    ['PingIncremented', 1, 2, 'already-applied'],
    ['PingIncremented', 4, 2, 'gap'],
    ['PingIncremented', 2, null, 'gap'],
  ] as const)('%s v%i com atual %s -> %s', (type, version, current, expected) => {
    expect(decideProjection(type, version, current)).toBe(expected);
  });
});
