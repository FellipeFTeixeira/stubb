import { AggregateNotFoundError } from '../../shared/errors.js';
import type { CatalogEvent } from '../domain/catalog-event.aggregate.js';
import type { Venue } from '../domain/venue.aggregate.js';
import type { CatalogEventRepository } from '../infrastructure/catalog-event.repository.js';
import type { VenueRepository } from '../infrastructure/venue.repository.js';

// Carrega o agregado do caminho da requisição; inexistente vira 404 AGGREGATE_NOT_FOUND.
export async function requireVenue(repository: VenueRepository, id: string): Promise<Venue> {
  const venue = await repository.findById(id);
  if (!venue) throw new AggregateNotFoundError('Venue not found');
  return venue;
}

export async function requireEvent(
  repository: CatalogEventRepository,
  id: string,
): Promise<CatalogEvent> {
  const event = await repository.findById(id);
  if (!event) throw new AggregateNotFoundError('Event not found');
  return event;
}
