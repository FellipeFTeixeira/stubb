import { randomBytes, randomUUID } from 'node:crypto';
import {
  catalogRoutes,
  type EntityCommandAccepted,
  type GetEventResponse,
  type GetOrganizerEventResponse,
  type GetVenueResponse,
} from '@stubb/contracts';
import { api, type ApiResponse } from './http.ts';

const READ_TIMEOUT_MS = 30000;
const DAY_MS = 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Palavra única (letras e dígitos, sem hífen) para achar o dado do teste na busca por título. */
export const uniqueWord = () => `e2e${randomBytes(4).toString('hex')}`;

type Method = 'POST' | 'PATCH' | 'DELETE';

/** Envia um command com `Idempotency-Key` nova (ou a informada) e devolve a resposta crua. */
export function send<T = EntityCommandAccepted>(
  method: Method,
  path: string,
  body?: unknown,
  idempotencyKey: string = randomUUID(),
): Promise<ApiResponse<T>> {
  return api<T>(method, path, { body, idempotencyKey });
}

/** Command que precisa ser aceito (202); qualquer outro status é falha do teste. */
export async function accept(
  method: Method,
  path: string,
  body?: unknown,
): Promise<EntityCommandAccepted> {
  const res = await send(method, path, body);
  if (res.status !== 202) {
    throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

/** Lê com `min_version` até a projeção alcançar a versão (200 e `minVersionReached`). */
export async function readAt<T extends { minVersionReached: boolean }>(
  path: string,
  minVersion: number,
): Promise<T> {
  const deadline = Date.now() + READ_TIMEOUT_MS;
  for (;;) {
    const res = await api<T>('GET', `${path}?min_version=${minVersion}`);
    if (res.status === 200 && res.body.minVersionReached) return res.body;
    if (Date.now() > deadline) {
      throw new Error(`${path} não chegou à versão ${minVersion} (último status ${res.status})`);
    }
    await sleep(200);
  }
}

/** Espera o 404 definitivo (`minVersionReached: true`), como o do descarte. */
export async function readMissingAt(path: string, minVersion: number): Promise<void> {
  const deadline = Date.now() + READ_TIMEOUT_MS;
  for (;;) {
    const res = await api<{ minVersionReached?: boolean }>(
      'GET',
      `${path}?min_version=${minVersion}`,
    );
    if (res.status === 404 && res.body.minVersionReached === true) return;
    if (Date.now() > deadline) throw new Error(`${path} não virou 404 definitivo`);
    await sleep(200);
  }
}

export const readVenueAt = (venueId: string, minVersion: number) =>
  readAt<GetVenueResponse>(catalogRoutes.organizerVenue(venueId), minVersion);

export const readOrganizerEventAt = (eventId: string, minVersion: number) =>
  readAt<GetOrganizerEventResponse>(catalogRoutes.organizerEvent(eventId), minVersion);

export const readPublicEventAt = (eventId: string, minVersion: number) =>
  readAt<GetEventResponse>(catalogRoutes.event(eventId), minVersion);

export interface VenueDraft {
  name: string;
  address: string;
  city: string;
  state: string;
  timeZone: string;
}

export function venueDraft(overrides: Partial<VenueDraft> = {}): VenueDraft {
  return {
    name: `Local ${uniqueWord()}`,
    address: 'Rua dos Testes, 100 - Centro',
    city: 'São Paulo',
    state: 'SP',
    timeZone: 'America/Sao_Paulo',
    ...overrides,
  };
}

export interface BuiltVenue {
  id: string;
  version: number;
  details: VenueDraft;
  /** Setor de pista (100 lugares) e setor marcado (filas A e B com 5 assentos). */
  generalAdmissionSectorId: string;
  seatedSectorId: string;
}

/** Cadastra um local com uma pista e um setor marcado, esperando a projeção a cada passo. */
export async function createVenueWithPlan(
  overrides: Partial<VenueDraft> = {},
): Promise<BuiltVenue> {
  const details = venueDraft(overrides);
  const registered = await accept('POST', catalogRoutes.venues, details);
  const pista = await accept('POST', catalogRoutes.venueSectors(registered.id), {
    name: 'Pista',
    kind: 'general_admission',
    capacity: 100,
  });
  const plateia = await accept('POST', catalogRoutes.venueSectors(registered.id), {
    name: 'Plateia',
    kind: 'seated',
    rows: [
      { label: 'A', seats: 5 },
      { label: 'B', seats: 5 },
    ],
  });
  await readVenueAt(registered.id, plateia.version);
  return {
    id: registered.id,
    version: plateia.version,
    details,
    generalAdmissionSectorId: pista.entityId,
    seatedSectorId: plateia.entityId,
  };
}

export interface EventDraft {
  title: string;
  description: string;
  category: string;
  ageRating: string;
  imageUrl: string | null;
}

export function eventDraft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    title: `Evento ${uniqueWord()}`,
    description: 'Descrição criada pelo teste de integração.',
    category: 'show',
    ageRating: '14',
    imageUrl: null,
    ...overrides,
  };
}

export async function createEvent(overrides: Partial<EventDraft> = {}) {
  const details = eventDraft(overrides);
  const created = await accept('POST', catalogRoutes.events, details);
  await readOrganizerEventAt(created.id, created.version);
  return { id: created.id, version: created.version, details };
}

/** `startsAt` daqui a 30 dias e `salesStartsAt` um minuto atrás, para as vendas já estarem abertas. */
export function sessionTimes(now: Date = new Date()) {
  return {
    startsAt: new Date(now.getTime() + 30 * DAY_MS).toISOString(),
    salesStartsAt: new Date(now.getTime() - 60 * 1000).toISOString(),
  };
}

export async function scheduleSession(eventId: string, venue: BuiltVenue) {
  const body = { venueId: venue.id, timeZone: venue.details.timeZone, ...sessionTimes() };
  const scheduled = await accept('POST', catalogRoutes.sessions(eventId), body);
  await readOrganizerEventAt(eventId, scheduled.version);
  return { sessionId: scheduled.entityId, version: scheduled.version, ...body };
}

/** Lê o evento do produtor e devolve os IDs dos setores copiados para a sessão, por nome. */
export async function sessionSectorIds(
  eventId: string,
  sessionId: string,
  minVersion: number,
): Promise<Record<string, string>> {
  const { event } = await readOrganizerEventAt(eventId, minVersion);
  const session = event.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`sessão ${sessionId} não está no evento ${eventId}`);
  return Object.fromEntries(session.sectors.map((s) => [s.name, s.id]));
}

export async function addBatch(
  eventId: string,
  sessionId: string,
  sessionSectorId: string,
  body: { name: string; priceCents: number; quantity?: number; endsAt?: string },
) {
  const added = await accept(
    'POST',
    catalogRoutes.batches(eventId, sessionId, sessionSectorId),
    body,
  );
  await readOrganizerEventAt(eventId, added.version);
  return added;
}

export async function publishSession(eventId: string, sessionId: string) {
  const published = await accept('POST', catalogRoutes.publishSession(eventId, sessionId), {});
  await readOrganizerEventAt(eventId, published.version);
  return published;
}

/**
 * Local + evento + sessão publicada, com um lote em cada setor.
 * Devolve o necessário para os testes conferirem vitrine e página.
 */
export async function createPublishedEvent(titleOverrides: Partial<EventDraft> = {}) {
  const venue = await createVenueWithPlan();
  const event = await createEvent(titleOverrides);
  const session = await scheduleSession(event.id, venue);
  const sectors = await sessionSectorIds(event.id, session.sessionId, session.version);
  const pista = sectors.Pista;
  const plateia = sectors.Plateia;
  if (!pista || !plateia) throw new Error('setores da sessão não foram copiados');
  await addBatch(event.id, session.sessionId, pista, { name: '1º lote', priceCents: 8000 });
  await addBatch(event.id, session.sessionId, plateia, { name: 'Lote único', priceCents: 12000 });
  const published = await publishSession(event.id, session.sessionId);
  return { venue, event, session, sectors, version: published.version };
}
