import type { OrganizerEventView, VenueView } from '@stubb/contracts';

// Dados de teste do produtor. IDs no formato que `z.uuid()` do Zod 4 aceita (versão e variante).
export const ID = {
  venue: '0190a0a0-0000-7000-8000-000000000001',
  venue2: '0190a0a0-0000-7000-8000-000000000002',
  event: '0190a0a0-0000-7000-8000-000000000011',
  session: '0190a0a0-0000-7000-8000-000000000021',
  session2: '0190a0a0-0000-7000-8000-000000000022',
  venueSector: '0190a0a0-0000-7000-8000-000000000031',
  venueSector2: '0190a0a0-0000-7000-8000-000000000032',
  sessionSector: '0190a0a0-0000-7000-8000-000000000041',
  batch: '0190a0a0-0000-7000-8000-000000000051',
  entity: '0190a0a0-0000-7000-8000-000000000061',
} as const;

export function venueView(overrides: Partial<VenueView> = {}): VenueView {
  return {
    id: ID.venue,
    version: 3,
    name: 'Arena Manaus',
    address: 'Av. Central, 100',
    city: 'Manaus',
    state: 'AM',
    timeZone: 'America/Manaus',
    sectors: [
      { id: ID.venueSector, name: 'Pista', kind: 'general_admission', capacity: 200, rows: null },
    ],
    ...overrides,
  };
}

export function eventView(overrides: Partial<OrganizerEventView> = {}): OrganizerEventView {
  return {
    id: ID.event,
    version: 2,
    status: 'draft',
    title: 'Show de Teste',
    description: 'Uma descrição',
    category: 'show',
    ageRating: 'L',
    imageUrl: null,
    createdAt: '2026-10-01T12:00:00.000Z',
    asOf: '2026-10-26T12:00:00.000Z',
    sessions: [],
    ...overrides,
  };
}

export function sessionView(
  overrides: Partial<OrganizerEventView['sessions'][number]> = {},
): OrganizerEventView['sessions'][number] {
  return {
    id: ID.session,
    status: 'draft',
    venueId: ID.venue,
    venue: {
      name: 'Arena Manaus',
      address: 'Av. Central, 100',
      city: 'Manaus',
      state: 'AM',
    },
    startsAt: '2026-12-11T00:00:00.000Z',
    salesStartsAt: '2026-11-01T14:00:00.000Z',
    timeZone: 'America/Manaus',
    ended: false,
    salesOpen: false,
    sectors: [
      {
        id: ID.sessionSector,
        venueSectorId: ID.venueSector,
        name: 'Pista',
        kind: 'general_admission',
        capacity: 200,
        rows: null,
        batches: [],
      },
    ],
    ...overrides,
  };
}
