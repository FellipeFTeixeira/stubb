import { describe, expect, it } from 'vitest';
import { instantToZonedLocal, zonedLocalToInstant, zonedParts } from '../index.js';

describe('zonedLocalToInstant', () => {
  it.each([
    ['2026-12-10T20:00', 'America/Sao_Paulo', '2026-12-10T23:00:00.000Z'],
    ['2026-12-10T20:00', 'America/Manaus', '2026-12-11T00:00:00.000Z'],
    ['2026-12-10T20:00', 'America/Noronha', '2026-12-10T22:00:00.000Z'],
    ['2026-12-10T20:00', 'America/Rio_Branco', '2026-12-11T01:00:00.000Z'],
    ['2018-12-10T20:00', 'America/Sao_Paulo', '2018-12-10T22:00:00.000Z'],
  ])('%s em %s -> %s e volta ao texto original', (local, zone, expected) => {
    const instant = zonedLocalToInstant(local, zone);
    expect(instant).toBe(expected);
    expect(instantToZonedLocal(instant, zone)).toBe(local);
  });

  it.each(['2026-12-10 20:00', '2026-12-10T20:00:00', '2026-12-10', 'abc', ''])(
    'rejeita formato %j',
    (v) => {
      expect(() => zonedLocalToInstant(v, 'America/Sao_Paulo')).toThrow(RangeError);
    },
  );

  it('rejeita data inexistente', () => {
    expect(() => zonedLocalToInstant('2026-13-40T20:00', 'America/Sao_Paulo')).toThrow(RangeError);
  });
});

describe('zonedParts', () => {
  it('devolve as partes no fuso, com hora 0-23', () => {
    expect(zonedParts('2026-12-11T00:00:00.000Z', 'America/Manaus')).toEqual({
      year: 2026,
      month: 12,
      day: 10,
      hour: 20,
      minute: 0,
    });
    expect(zonedParts('2026-12-11T03:30:00.000Z', 'America/Sao_Paulo').hour).toBe(0);
  });
});
