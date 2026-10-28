import { randomBytes, randomUUID } from 'node:crypto';
import {
  catalogRoutes,
  type EntityCommandAccepted,
  type GetEventResponse,
  type GetOrganizerEventResponse,
  type GetVenueResponse,
} from '@stubb/contracts';
import { api, type ApiResponse } from './http.ts';
import { organizerToken } from './identity.ts';

const READ_TIMEOUT_MS = 30000;
const DAY_MS = 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Palavra única (letras e dígitos, sem hífen) para achar o dado do teste na busca por título. */
export const uniqueWord = () => `e2e${randomBytes(4).toString('hex')}`;

type Method = 'POST' | 'PATCH' | 'DELETE';

/**
 * Todo helper abaixo age como o produtor seed, salvo quando recebe `token` (outro produtor).
 * As rotas públicas ignoram o token, então mandá-lo nelas é inofensivo.
 */
const tokenOrSeed = async (token?: string) => token ?? (await organizerToken());

/** Envia um command com `Idempotency-Key` nova (ou a informada) e devolve a resposta crua. */
export async function send<T = EntityCommandAccepted>(
  method: Method,
  path: string,
  body?: unknown,
  idempotencyKey: string = randomUUID(),
  token?: string,
): Promise<ApiResponse<T>> {
  return api<T>(method, path, { body, idempotencyKey, token: await tokenOrSeed(token) });
}

/** Command que precisa ser aceito (202); qualquer outro status é falha do teste. */
export async function accept(
  method: Method,
  path: string,
  body?: unknown,
  token?: string,
): Promise<EntityCommandAccepted> {
  const res = await send(method, path, body, randomUUID(), token);
  if (res.status !== 202) {
    throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

/** Lê com `min_version` até a projeção alcançar a versão (200 e `minVersionReached`). */
export async function readAt<T extends { minVersionReached: boolean }>(
  path: string,
  minVersion: number,
  token?: string,
): Promise<T> {
  const bearer = await tokenOrSeed(token);
  const deadline = Date.now() + READ_TIMEOUT_MS;
  for (;;) {
    const res = await api<T>('GET', `${path}?min_version=${minVersion}`, { token: bearer });
    if (res.status === 200 && res.body.minVersionReached) return res.body;
    if (Date.now() > deadline) {
      throw new Error(`${path} não chegou à versão ${minVersion} (último status ${res.status})`);
    }
    await sleep(200);
  }
}

/** Espera o 404 definitivo (`minVersionReached: true`), como o do descarte. */
export async function readMissingAt(
  path: string,
  minVersion: number,
  token?: string,
): Promise<void> {
  const bearer = await tokenOrSeed(token);
  const deadline = Date.now() + READ_TIMEOUT_MS;
  for (;;) {
    const res = await api<{ minVersionReached?: boolean }>(
      'GET',
      `${path}?min_version=${minVersion}`,
      { token: bearer },
    );
    if (res.status === 404 && res.body.minVersionReached === true) return;
    if (Date.now() > deadline) throw new Error(`${path} não virou 404 definitivo`);
    await sleep(200);
  }
}

export const readVenueAt = (venueId: string, minVersion: number, token?: string) =>
  readAt<GetVenueResponse>(catalogRoutes.organizerVenue(venueId), minVersion, token);

export const readOrganizerEventAt = (eventId: string, minVersion: number, token?: string) =>
  readAt<GetOrganizerEventResponse>(catalogRoutes.organizerEvent(eventId), minVersion, token);

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
  token?: string,
): Promise<BuiltVenue> {
  const details = venueDraft(overrides);
  const registered = await accept('POST', catalogRoutes.venues, details, token);
  const pista = await accept(
    'POST',
    catalogRoutes.venueSectors(registered.id),
    { name: 'Pista', kind: 'general_admission', capacity: 100 },
    token,
  );
  const plateia = await accept(
    'POST',
    catalogRoutes.venueSectors(registered.id),
    {
      name: 'Plateia',
      kind: 'seated',
      rows: [
        { label: 'A', seats: 5 },
        { label: 'B', seats: 5 },
      ],
    },
    token,
  );
  await readVenueAt(registered.id, plateia.version, token);
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

export async function createEvent(overrides: Partial<EventDraft> = {}, token?: string) {
  const details = eventDraft(overrides);
  const created = await accept('POST', catalogRoutes.events, details, token);
  await readOrganizerEventAt(created.id, created.version, token);
  return { id: created.id, version: created.version, details };
}

/** `startsAt` daqui a 30 dias e `salesStartsAt` um minuto atrás, para as vendas já estarem abertas. */
export function sessionTimes(now: Date = new Date()) {
  return {
    startsAt: new Date(now.getTime() + 30 * DAY_MS).toISOString(),
    salesStartsAt: new Date(now.getTime() - 60 * 1000).toISOString(),
  };
}

export async function scheduleSession(eventId: string, venue: BuiltVenue, token?: string) {
  const body = { venueId: venue.id, timeZone: venue.details.timeZone, ...sessionTimes() };
  const scheduled = await accept('POST', catalogRoutes.sessions(eventId), body, token);
  await readOrganizerEventAt(eventId, scheduled.version, token);
  return { sessionId: scheduled.entityId, version: scheduled.version, ...body };
}

/** Lê o evento do produtor e devolve os IDs dos setores copiados para a sessão, por nome. */
export async function sessionSectorIds(
  eventId: string,
  sessionId: string,
  minVersion: number,
  token?: string,
): Promise<Record<string, string>> {
  const { event } = await readOrganizerEventAt(eventId, minVersion, token);
  const session = event.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`sessão ${sessionId} não está no evento ${eventId}`);
  return Object.fromEntries(session.sectors.map((s) => [s.name, s.id]));
}

export async function addBatch(
  eventId: string,
  sessionId: string,
  sessionSectorId: string,
  body: { name: string; priceCents: number; quantity?: number; endsAt?: string },
  token?: string,
) {
  const added = await accept(
    'POST',
    catalogRoutes.batches(eventId, sessionId, sessionSectorId),
    body,
    token,
  );
  await readOrganizerEventAt(eventId, added.version, token);
  return added;
}

export async function publishSession(eventId: string, sessionId: string, token?: string) {
  const published = await accept(
    'POST',
    catalogRoutes.publishSession(eventId, sessionId),
    {},
    token,
  );
  await readOrganizerEventAt(eventId, published.version, token);
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
