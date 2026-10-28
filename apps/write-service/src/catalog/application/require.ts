import { AggregateNotFoundError } from '../../shared/errors.js';
import type { CatalogEvent } from '../domain/catalog-event.aggregate.js';
import type { Venue } from '../domain/venue.aggregate.js';
import type { CatalogEventRepository } from '../infrastructure/catalog-event.repository.js';
import type { VenueRepository } from '../infrastructure/venue.repository.js';

// Carrega o agregado do caminho da requisição. Inexistente ou de outro produtor vira
// 404 AGGREGATE_NOT_FOUND (RN-19); a posse é checada aqui, antes de qualquer versão esperada (409).
export async function requireVenue(
  repository: VenueRepository,
  id: string,
  actorId: string,
): Promise<Venue> {
  const venue = await repository.findById(id);
  if (venue?.organizerId !== actorId) throw new AggregateNotFoundError('Venue not found');
  return venue;
}

export async function requireEvent(
  repository: CatalogEventRepository,
  id: string,
  actorId: string,
): Promise<CatalogEvent> {
  const event = await repository.findById(id);
  if (event?.organizerId !== actorId) throw new AggregateNotFoundError('Event not found');
  return event;
}
