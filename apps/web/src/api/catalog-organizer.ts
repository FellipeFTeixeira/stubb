import {
  CommandAcceptedSchema,
  EntityCommandAcceptedSchema,
  GetOrganizerEventResponseSchema,
  GetVenueResponseSchema,
  ListOrganizerEventsResponseSchema,
  ListVenuesResponseSchema,
  MIN_VERSION_QUERY_PARAM,
  catalogRoutes,
  type AddBatchRequest,
  type AddSessionSectorRequest,
  type AddVenueSectorRequest,
  type CommandAccepted,
  type CreateEventRequest,
  type EntityCommandAccepted,
  type ListOrganizerEventsResponse,
  type ListVenuesResponse,
  type OrganizerEventView,
  type RegisterVenueRequest,
  type ScheduleSessionRequest,
  type UpdateEventDetailsRequest,
  type UpdateVenueDetailsRequest,
  type VenueView,
} from '@stubb/contracts';
import { ApiError, getJson, sendCommand, withQuery } from './http';

// Commands: cada função recebe os parâmetros de rota, o corpo (já validado pelo formulário) e a
// Idempotency-Key da intenção. Quem chama decide a chave; aqui só se monta a requisição.

export function registerVenue(
  body: RegisterVenueRequest,
  idempotencyKey: string,
): Promise<CommandAccepted> {
  return sendCommand('POST', catalogRoutes.venues, idempotencyKey, body, CommandAcceptedSchema);
}

export function updateVenueDetails(
  venueId: string,
  body: UpdateVenueDetailsRequest,
  idempotencyKey: string,
): Promise<CommandAccepted> {
  return sendCommand(
    'PATCH',
    catalogRoutes.venue(venueId),
    idempotencyKey,
    body,
    CommandAcceptedSchema,
  );
}

export function addVenueSector(
  venueId: string,
  body: AddVenueSectorRequest,
  idempotencyKey: string,
): Promise<EntityCommandAccepted> {
  return sendCommand(
    'POST',
    catalogRoutes.venueSectors(venueId),
    idempotencyKey,
    body,
    EntityCommandAcceptedSchema,
  );
}

export function removeVenueSector(
  venueId: string,
  venueSectorId: string,
  idempotencyKey: string,
): Promise<CommandAccepted> {
  return sendCommand(
    'DELETE',
    catalogRoutes.venueSector(venueId, venueSectorId),
    idempotencyKey,
    undefined,
    CommandAcceptedSchema,
  );
}

export function createEvent(
  body: CreateEventRequest,
  idempotencyKey: string,
): Promise<CommandAccepted> {
  return sendCommand('POST', catalogRoutes.events, idempotencyKey, body, CommandAcceptedSchema);
}

export function updateEventDetails(
  eventId: string,
  body: UpdateEventDetailsRequest,
  idempotencyKey: string,
): Promise<CommandAccepted> {
  return sendCommand(
    'PATCH',
    catalogRoutes.event(eventId),
    idempotencyKey,
    body,
    CommandAcceptedSchema,
  );
}

export function discardEvent(eventId: string, idempotencyKey: string): Promise<CommandAccepted> {
  return sendCommand(
    'DELETE',
    catalogRoutes.event(eventId),
    idempotencyKey,
    undefined,
    CommandAcceptedSchema,
  );
}

export function scheduleSession(
  eventId: string,
  body: ScheduleSessionRequest,
  idempotencyKey: string,
): Promise<EntityCommandAccepted> {
  return sendCommand(
    'POST',
    catalogRoutes.sessions(eventId),
    idempotencyKey,
    body,
    EntityCommandAcceptedSchema,
  );
}

export function removeSession(
  eventId: string,
  sessionId: string,
  idempotencyKey: string,
): Promise<CommandAccepted> {
  return sendCommand(
    'DELETE',
    catalogRoutes.session(eventId, sessionId),
    idempotencyKey,
    undefined,
    CommandAcceptedSchema,
  );
}

export function publishSession(
  eventId: string,
  sessionId: string,
  idempotencyKey: string,
): Promise<CommandAccepted> {
  return sendCommand(
    'POST',
    catalogRoutes.publishSession(eventId, sessionId),
    idempotencyKey,
    {},
    CommandAcceptedSchema,
  );
}

export function addSessionSector(
  eventId: string,
  sessionId: string,
  body: AddSessionSectorRequest,
  idempotencyKey: string,
): Promise<EntityCommandAccepted> {
  return sendCommand(
    'POST',
    catalogRoutes.sessionSectors(eventId, sessionId),
    idempotencyKey,
    body,
    EntityCommandAcceptedSchema,
  );
}

export function removeSessionSector(
  eventId: string,
  sessionId: string,
  sessionSectorId: string,
  idempotencyKey: string,
): Promise<CommandAccepted> {
  return sendCommand(
    'DELETE',
    catalogRoutes.sessionSector(eventId, sessionId, sessionSectorId),
    idempotencyKey,
    undefined,
    CommandAcceptedSchema,
  );
}

export function addBatch(
  eventId: string,
  sessionId: string,
  sessionSectorId: string,
  body: AddBatchRequest,
  idempotencyKey: string,
): Promise<EntityCommandAccepted> {
  return sendCommand(
    'POST',
    catalogRoutes.batches(eventId, sessionId, sessionSectorId),
    idempotencyKey,
    body,
    EntityCommandAcceptedSchema,
  );
}

export function removeBatch(
  eventId: string,
  sessionId: string,
  sessionSectorId: string,
  batchId: string,
  idempotencyKey: string,
): Promise<CommandAccepted> {
  return sendCommand(
    'DELETE',
    catalogRoutes.batch(eventId, sessionId, sessionSectorId, batchId),
    idempotencyKey,
    undefined,
    CommandAcceptedSchema,
  );
}

// Leituras do produtor. As de um item devolvem sempre `minVersionReached` (inclusive no 404),
// que é o que `useVersionedQuery` precisa para decidir se continua esperando a projeção.

export type OrganizerEventRead =
  | { status: 'found'; event: OrganizerEventView; minVersionReached: boolean }
  | { status: 'not-found'; minVersionReached: boolean };

export type VenueRead =
  | { status: 'found'; venue: VenueView; minVersionReached: boolean }
  | { status: 'not-found'; minVersionReached: boolean };

export async function getOrganizerEvent(
  eventId: string,
  minVersion?: number,
): Promise<OrganizerEventRead> {
  const result = await getJson(
    withQuery(catalogRoutes.organizerEvent(eventId), { [MIN_VERSION_QUERY_PARAM]: minVersion }),
    GetOrganizerEventResponseSchema,
  );
  return result.status === 'found'
    ? {
        status: 'found',
        event: result.data.event,
        minVersionReached: result.data.minVersionReached,
      }
    : result;
}

export async function getVenue(venueId: string, minVersion?: number): Promise<VenueRead> {
  const result = await getJson(
    withQuery(catalogRoutes.organizerVenue(venueId), { [MIN_VERSION_QUERY_PARAM]: minVersion }),
    GetVenueResponseSchema,
  );
  return result.status === 'found'
    ? {
        status: 'found',
        venue: result.data.venue,
        minVersionReached: result.data.minVersionReached,
      }
    : result;
}

export async function listOrganizerEvents(page: number): Promise<ListOrganizerEventsResponse> {
  const result = await getJson(
    withQuery(catalogRoutes.organizerEvents, { page }),
    ListOrganizerEventsResponseSchema,
  );
  if (result.status === 'not-found') throw new ApiError(404, null);
  return result.data;
}

export async function listVenues(): Promise<ListVenuesResponse> {
  const result = await getJson(catalogRoutes.organizerVenues, ListVenuesResponseSchema);
  if (result.status === 'not-found') throw new ApiError(404, null);
  return result.data;
}
