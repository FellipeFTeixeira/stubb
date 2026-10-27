import { Injectable } from '@nestjs/common';
import {
  READ_STORE_COLLECTIONS,
  VENUE_AGGREGATE_TYPE,
  type CatalogDomainEvent,
  type EventDetailDocument,
  type EventDetailTombstone,
  type EventDomainEventV1,
  type EventListingDocument,
  type OrganizerEventDocument,
  type VenueDocument,
  type VenueDomainEventV1,
} from '@stubb/contracts';
import type { ProjectionTx } from '../projection-executor.js';
import { reduceEventDetail } from './event-detail.reducer.js';
import { toListing, toOrganizerEvent } from './summaries.js';
import { applyVenueSnapshot, reduceVenue, toVenueSnapshot } from './venue.reducer.js';

type StoredEventDetail = EventDetailDocument | EventDetailTombstone;

function isVenueEvent(event: CatalogDomainEvent): event is VenueDomainEventV1 {
  return event.aggregateType === VENUE_AGGREGATE_TYPE;
}

/**
 * Projeta o Catalog. Um evento do agregado Evento grava `event_detail` e, na mesma transação, os
 * dois resumos. Um evento do Local grava `venues` e faz fan-out do snapshot nos eventos que o usam.
 * Idempotência e sequência por agregado ficam no ProjectionExecutor.
 */
@Injectable()
export class CatalogProjection {
  async apply(event: CatalogDomainEvent, tx: ProjectionTx): Promise<void> {
    if (isVenueEvent(event)) {
      await this.applyVenueEvent(event, tx);
    } else {
      await this.applyEventEvent(event, tx);
    }
  }

  private async applyEventEvent(event: EventDomainEventV1, tx: ProjectionTx): Promise<void> {
    const { session, db } = tx;
    const details = db.collection<StoredEventDetail>(READ_STORE_COLLECTIONS.eventDetail);
    const venues = db.collection<VenueDocument>(READ_STORE_COLLECTIONS.venues);

    const stored = await details.findOne({ _id: event.aggregateId }, { session });
    if (stored?.status === 'discarded') {
      throw new Error(`Event ${event.aggregateId} was discarded; got ${event.eventType}`);
    }

    let venueSnapshot = null;
    if (event.eventType === 'SessionScheduled') {
      const venue = await venues.findOne({ _id: event.payload.venueId }, { session });
      venueSnapshot = toVenueSnapshot(venue);
    }

    const next = reduceEventDetail(stored, event, venueSnapshot);
    await this.write(tx, next);
  }

  private async applyVenueEvent(event: VenueDomainEventV1, tx: ProjectionTx): Promise<void> {
    const { session, db } = tx;
    const venues = db.collection<VenueDocument>(READ_STORE_COLLECTIONS.venues);
    const details = db.collection<StoredEventDetail>(READ_STORE_COLLECTIONS.eventDetail);

    const current = await venues.findOne({ _id: event.aggregateId }, { session });
    const next = reduceVenue(current, event);
    await venues.replaceOne({ _id: next._id }, next, { session, upsert: true });

    // Só mudança de dados do local propaga; evento de planta não é copiado para as sessões.
    if (event.eventType !== 'VenueRegistered' && event.eventType !== 'VenueDetailsUpdated') return;

    const snapshot = toVenueSnapshot(next);
    if (snapshot === null) return;
    const affected = await details
      .find({ 'sessions.venueId': next._id, status: { $ne: 'discarded' } }, { session })
      .toArray();
    for (const doc of affected) {
      if (doc.status === 'discarded') continue;
      const updated = applyVenueSnapshot(doc, next._id, snapshot);
      if (updated !== null) await this.write(tx, updated);
    }
  }

  /** Grava o detalhe e deriva os resumos; a lápide apaga os dois resumos. */
  private async write(tx: ProjectionTx, detail: StoredEventDetail): Promise<void> {
    const { session, db } = tx;
    const details = db.collection<StoredEventDetail>(READ_STORE_COLLECTIONS.eventDetail);
    const listing = db.collection<EventListingDocument>(READ_STORE_COLLECTIONS.eventListing);
    const organizer = db.collection<OrganizerEventDocument>(READ_STORE_COLLECTIONS.organizerEvents);

    await details.replaceOne({ _id: detail._id }, detail, { session, upsert: true });

    const listingDoc = toListing(detail);
    if (listingDoc) {
      await listing.replaceOne({ _id: detail._id }, listingDoc, { session, upsert: true });
    } else {
      await listing.deleteOne({ _id: detail._id }, { session });
    }

    const organizerDoc = toOrganizerEvent(detail);
    if (organizerDoc) {
      await organizer.replaceOne({ _id: detail._id }, organizerDoc, { session, upsert: true });
    } else {
      await organizer.deleteOne({ _id: detail._id }, { session });
    }
  }
}
