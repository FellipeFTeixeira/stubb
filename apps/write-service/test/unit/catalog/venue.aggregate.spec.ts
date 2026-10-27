import { v7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { Venue } from '../../../src/catalog/domain/venue.aggregate.js';
import { BusinessRuleViolationError, EntityNotFoundError } from '../../../src/shared/errors.js';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const DETAILS = {
  name: 'Teatro Aurora',
  address: 'Rua das Acácias, 120',
  city: 'São Paulo',
  state: 'SP',
  timeZone: 'America/Sao_Paulo',
};

function newVenue(): Venue {
  const venue = Venue.register(v7(), v7(), DETAILS, NOW);
  venue.uncommit();
  return venue;
}

function pista(name: string, capacity = 100) {
  return { id: v7(), name, kind: 'general_admission' as const, capacity };
}

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof BusinessRuleViolationError) return error.code;
    throw error;
  }
  return undefined;
}

describe('Venue (CA-6 a CA-9)', () => {
  it('register: versão 1 e um evento VenueRegistered', () => {
    const venue = Venue.register(v7(), 'org', DETAILS, NOW);
    expect(venue.version).toBe(1);
    expect(venue.getUncommittedEvents()).toMatchObject([
      { type: 'VenueRegistered', aggregateVersion: 1, organizerId: 'org' },
    ]);
  });

  it('updateDetails: versão + 1 e evento VenueDetailsUpdated', () => {
    const venue = newVenue();
    venue.updateDetails({ ...DETAILS, name: 'Novo nome' }, NOW);
    expect(venue.version).toBe(2);
    expect(venue.details.name).toBe('Novo nome');
    expect(venue.getUncommittedEvents()).toMatchObject([
      { type: 'VenueDetailsUpdated', aggregateVersion: 2 },
    ]);
  });

  it('addSector: posição é a maior + 1; marcado guarda filas e não guarda capacidade', () => {
    const venue = newVenue();
    venue.addSector(pista('Pista'), NOW);
    venue.addSector(
      {
        id: v7(),
        name: 'Plateia',
        kind: 'seated',
        rows: [
          { label: 'A', seats: 10 },
          { label: 'B', seats: 12 },
        ],
      },
      NOW,
    );
    expect(venue.version).toBe(3);
    expect(venue.sectors.map((s) => [s.name, s.position, s.capacity])).toEqual([
      ['Pista', 1, 100],
      ['Plateia', 2, null],
    ]);
    expect(venue.sectors[1]?.rows).toHaveLength(2);
  });

  it('addSector: o 21º setor viola VENUE_SECTOR_LIMIT_REACHED', () => {
    const venue = newVenue();
    for (let i = 1; i <= 20; i += 1) venue.addSector(pista(`Setor ${i}`), NOW);
    expect(codeOf(() => venue.addSector(pista('Setor 21'), NOW))).toBe(
      'VENUE_SECTOR_LIMIT_REACHED',
    );
    expect(venue.sectors).toHaveLength(20);
  });

  it('addSector: nome repetido sem diferenciar maiúsculas viola VENUE_SECTOR_NAME_TAKEN', () => {
    const venue = newVenue();
    venue.addSector(pista('Pista Premium'), NOW);
    const before = venue.version;
    expect(codeOf(() => venue.addSector(pista('  PISTA premium '), NOW))).toBe(
      'VENUE_SECTOR_NAME_TAKEN',
    );
    expect(venue.version).toBe(before);
  });

  it('removeSector: remove e emite VenueSectorRemoved; inexistente é EntityNotFoundError', () => {
    const venue = newVenue();
    const sector = pista('Pista');
    venue.addSector(sector, NOW);
    venue.uncommit();
    venue.removeSector(sector.id, NOW);
    expect(venue.sectors).toHaveLength(0);
    expect(venue.getUncommittedEvents()).toMatchObject([
      { type: 'VenueSectorRemoved', venueSectorId: sector.id },
    ]);
    expect(() => venue.removeSector(sector.id, NOW)).toThrow(EntityNotFoundError);
  });

  it('a posição continua crescendo depois de remover um setor', () => {
    const venue = newVenue();
    const first = pista('A');
    venue.addSector(first, NOW);
    venue.addSector(pista('B'), NOW);
    venue.removeSector(first.id, NOW);
    venue.addSector(pista('C'), NOW);
    expect(venue.sectors.map((s) => [s.name, s.position])).toEqual([
      ['B', 2],
      ['C', 3],
    ]);
  });
});
