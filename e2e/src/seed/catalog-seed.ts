import {
  catalogRoutes,
  ListOrganizerEventsResponseSchema,
  zonedLocalToInstant,
  zonedParts,
  type BRAZIL_TIME_ZONES,
} from '@stubb/contracts';
import { accept, readOrganizerEventAt, readVenueAt, sessionSectorIds } from '../support/catalog.ts';
import { api } from '../support/http.ts';

type TimeZone = (typeof BRAZIL_TIME_ZONES)[number];

export const SEED_EXISTS_MESSAGE = 'Seed de demonstração já existe; nada a fazer.';

interface SeatedSector {
  name: string;
  kind: 'seated';
  /** Fileiras `A`, `B`, ... consecutivas, todas com a mesma quantidade de assentos. */
  rows: number;
  seatsPerRow: number;
}
interface GeneralAdmissionSector {
  name: string;
  kind: 'general_admission';
  capacity: number;
}
type SectorSpec = SeatedSector | GeneralAdmissionSector;

interface VenueSpec {
  name: string;
  address: string;
  city: string;
  state: string;
  timeZone: TimeZone;
  sectors: SectorSpec[];
}

const VENUES = {
  aurora: {
    name: 'Teatro Aurora',
    address: 'Rua das Acácias, 120 - Centro',
    city: 'São Paulo',
    state: 'SP',
    timeZone: 'America/Sao_Paulo',
    sectors: [
      { name: 'Plateia', kind: 'seated', rows: 10, seatsPerRow: 20 },
      { name: 'Balcão', kind: 'seated', rows: 5, seatsPerRow: 16 },
    ],
  },
  horizonte: {
    name: 'Arena Horizonte',
    address: 'Avenida Horizonte, 1000 - Centro',
    city: 'Belo Horizonte',
    state: 'MG',
    timeZone: 'America/Sao_Paulo',
    sectors: [
      { name: 'Pista', kind: 'general_admission', capacity: 3000 },
      { name: 'Pista Premium', kind: 'general_admission', capacity: 500 },
      { name: 'Cadeira Superior', kind: 'seated', rows: 20, seatsPerRow: 50 },
    ],
  },
  rioNegro: {
    name: 'Casa Rio Negro',
    address: 'Rua do Porto, 200 - Centro',
    city: 'Manaus',
    state: 'AM',
    timeZone: 'America/Manaus',
    sectors: [
      { name: 'Pista', kind: 'general_admission', capacity: 600 },
      { name: 'Mezanino', kind: 'seated', rows: 4, seatsPerRow: 25 },
    ],
  },
} as const satisfies Record<string, VenueSpec>;

type VenueKey = keyof typeof VENUES;

/** `endsAtDay` = dia (D+N, às 00:00 no fuso do local); sem `quantity` e sem `endsAtDay` = sem limite. */
interface BatchSpec {
  name: string;
  priceCents: number;
  quantity?: number;
  endsAtDay?: number;
}

interface SessionSpec {
  venue: VenueKey;
  day: number;
  time: string;
  /** Padrão: o instante em que o seed começou. */
  salesStartsAtDay?: number;
  removeSectors?: string[];
  batches: Record<string, BatchSpec[]>;
  publish: boolean;
}

interface EventSpec {
  title: string;
  description: string;
  category: string;
  ageRating: string;
  sessions: SessionSpec[];
}

const hamletBatches: Record<string, BatchSpec[]> = {
  Plateia: [
    { name: '1º lote', priceCents: 8000, quantity: 100, endsAtDay: 15 },
    { name: '2º lote', priceCents: 10000 },
  ],
  Balcão: [{ name: 'Lote único', priceCents: 5000 }],
};

const festivalBatches: Record<string, BatchSpec[]> = {
  Pista: [
    { name: '1º lote', priceCents: 15000, quantity: 1000, endsAtDay: 20 },
    { name: '2º lote', priceCents: 19000, quantity: 1000, endsAtDay: 40 },
    { name: '3º lote', priceCents: 23000 },
  ],
  'Pista Premium': [
    { name: '1º lote', priceCents: 35000, quantity: 200 },
    { name: '2º lote', priceCents: 42000 },
  ],
  'Cadeira Superior': [{ name: 'Lote único', priceCents: 28000 }],
};

const EVENTS: EventSpec[] = [
  {
    title: 'Hamlet',
    description: 'Montagem da tragédia de Shakespeare em temporada no Teatro Aurora.',
    category: 'theater',
    ageRating: '14',
    sessions: [
      { venue: 'aurora', day: 30, time: '20:00', batches: hamletBatches, publish: true },
      { venue: 'aurora', day: 31, time: '20:00', batches: hamletBatches, publish: true },
      { venue: 'aurora', day: 32, time: '18:00', batches: hamletBatches, publish: true },
      { venue: 'aurora', day: 33, time: '20:00', batches: {}, publish: false },
    ],
  },
  {
    title: 'Horizonte Rock Festival',
    description: 'Dois dias de rock com bandas nacionais na Arena Horizonte.',
    category: 'festival',
    ageRating: '16',
    sessions: [
      { venue: 'horizonte', day: 60, time: '16:00', batches: festivalBatches, publish: true },
      { venue: 'horizonte', day: 61, time: '16:00', batches: festivalBatches, publish: true },
    ],
  },
  {
    title: 'Riso Solto: a turnê',
    description: 'Espetáculo de stand-up em turnê por São Paulo e Manaus.',
    category: 'stand_up',
    ageRating: '16',
    sessions: [
      {
        venue: 'aurora',
        day: 45,
        time: '21:00',
        removeSectors: ['Balcão'],
        batches: { Plateia: [{ name: 'Lote único', priceCents: 7000 }] },
        publish: true,
      },
      {
        venue: 'rioNegro',
        day: 52,
        time: '21:00',
        salesStartsAtDay: 10,
        batches: {
          Pista: [{ name: 'Lote único', priceCents: 6000 }],
          Mezanino: [{ name: 'Lote único', priceCents: 9000 }],
        },
        publish: true,
      },
    ],
  },
  {
    title: 'Bolhas de Sabão',
    description: 'Espetáculo infantil com música, bolhas e muita brincadeira.',
    category: 'kids',
    ageRating: 'L',
    sessions: [{ venue: 'aurora', day: 40, time: '15:00', batches: {}, publish: false }],
  },
];

export const DEMO_TITLES = EVENTS.map((event) => event.title);

/** Dia (YYYY-MM-DD) de hoje no fuso, somado de `offset` dias. */
function dayPlus(seedStartedAt: string, timeZone: string, offset: number): string {
  const { year, month, day } = zonedParts(seedStartedAt, timeZone);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

function instantAt(
  seedStartedAt: string,
  timeZone: string,
  dayOffset: number,
  time: string,
): string {
  return zonedLocalToInstant(`${dayPlus(seedStartedAt, timeZone, dayOffset)}T${time}`, timeZone);
}

async function listAllOrganizerTitles(): Promise<string[]> {
  const titles: string[] = [];
  for (let page = 1; ; page += 1) {
    const res = await api('GET', `${catalogRoutes.organizerEvents}?page=${page}&pageSize=48`);
    if (res.status !== 200) throw new Error(`GET organizer/events → ${res.status}`);
    const parsed = ListOrganizerEventsResponseSchema.parse(res.body);
    titles.push(...parsed.items.map((item) => item.title));
    if (parsed.items.length === 0 || titles.length >= parsed.total) return titles;
  }
}

function sectorBody(sector: SectorSpec) {
  if (sector.kind === 'general_admission') {
    return { name: sector.name, kind: sector.kind, capacity: sector.capacity };
  }
  const rows = Array.from({ length: sector.rows }, (_, index) => ({
    label: String.fromCharCode('A'.charCodeAt(0) + index),
    seats: sector.seatsPerRow,
  }));
  return { name: sector.name, kind: sector.kind, rows };
}

async function seedVenues(): Promise<Record<VenueKey, string>> {
  const ids = {} as Record<VenueKey, string>;
  for (const key of Object.keys(VENUES) as VenueKey[]) {
    const { sectors, ...details } = VENUES[key];
    const registered = await accept('POST', catalogRoutes.venues, details);
    let version = registered.version;
    for (const sector of sectors) {
      const added = await accept(
        'POST',
        catalogRoutes.venueSectors(registered.id),
        sectorBody(sector),
      );
      version = added.version;
    }
    await readVenueAt(registered.id, version);
    ids[key] = registered.id;
  }
  return ids;
}

async function seedEvent(
  event: EventSpec,
  venueIds: Record<VenueKey, string>,
  seedStartedAt: string,
): Promise<void> {
  const created = await accept('POST', catalogRoutes.events, {
    title: event.title,
    description: event.description,
    category: event.category,
    ageRating: event.ageRating,
  });
  await readOrganizerEventAt(created.id, created.version);

  for (const spec of event.sessions) {
    const venue = VENUES[spec.venue];
    const timeZone = venue.timeZone;
    const startsAt = instantAt(seedStartedAt, timeZone, spec.day, spec.time);
    const salesStartsAt =
      spec.salesStartsAtDay === undefined
        ? seedStartedAt
        : instantAt(seedStartedAt, timeZone, spec.salesStartsAtDay, '00:00');
    const scheduled = await accept('POST', catalogRoutes.sessions(created.id), {
      venueId: venueIds[spec.venue],
      startsAt,
      salesStartsAt,
      timeZone,
    });
    const sessionId = scheduled.entityId;
    let version = scheduled.version;
    // Os IDs dos setores copiados só existem no read model.
    const sectorIds = await sessionSectorIds(created.id, sessionId, version);

    for (const name of spec.removeSectors ?? []) {
      const sectorId = sectorIds[name];
      if (!sectorId) throw new Error(`setor ${name} não está na sessão`);
      const removed = await accept(
        'DELETE',
        catalogRoutes.sessionSector(created.id, sessionId, sectorId),
      );
      version = removed.version;
    }

    for (const [sectorName, batches] of Object.entries(spec.batches)) {
      const sectorId = sectorIds[sectorName];
      if (!sectorId) throw new Error(`setor ${sectorName} não está na sessão`);
      for (const batch of batches) {
        const added = await accept('POST', catalogRoutes.batches(created.id, sessionId, sectorId), {
          name: batch.name,
          priceCents: batch.priceCents,
          quantity: batch.quantity,
          endsAt:
            batch.endsAtDay === undefined
              ? undefined
              : instantAt(seedStartedAt, timeZone, batch.endsAtDay, '00:00'),
        });
        version = added.version;
      }
    }

    if (spec.publish) {
      const published = await accept(
        'POST',
        catalogRoutes.publishSession(created.id, sessionId),
        {},
      );
      version = published.version;
    }
    await readOrganizerEventAt(created.id, version);
  }
}

/** Cria os 3 locais e 4 eventos de demonstração, ou avisa que já existem. */
export async function seedCatalog(log: (message: string) => void = console.log) {
  const existing = await listAllOrganizerTitles();
  if (DEMO_TITLES.some((title) => existing.includes(title))) {
    log(SEED_EXISTS_MESSAGE);
    return { created: false as const };
  }

  const seedStartedAt = new Date().toISOString();
  const venueIds = await seedVenues();
  log(
    `Locais criados: ${Object.values(VENUES)
      .map((v) => v.name)
      .join(', ')}`,
  );
  for (const event of EVENTS) {
    await seedEvent(event, venueIds, seedStartedAt);
    log(`Evento criado: ${event.title} (${event.sessions.length} sessões)`);
  }
  return { created: true as const };
}
