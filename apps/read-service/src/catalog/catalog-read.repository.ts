import { Inject, Injectable } from '@nestjs/common';
import {
  type EventDetailDocument,
  type EventDetailTombstone,
  type EventListingDocument,
  type OrganizerEventDocument,
  READ_STORE_COLLECTIONS,
  type VenueDocument,
} from '@stubb/contracts';
import type { Db, Document, Filter } from 'mongodb';
import { MONGO_DB } from '../mongo/mongo.module.js';

export interface ListEventsParams {
  now: Date;
  /** Already normalized (see normalizeSearchKey) when it is the city. */
  q?: string;
  cityKey?: string;
  category?: string;
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

// Read-only access to the Catalog read models. It never writes (regra 2).
@Injectable()
export class CatalogReadRepository {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  async listEvents(params: ListEventsParams): Promise<Page<EventListingDocument>> {
    const { now, q, cityKey, category, page, pageSize } = params;
    const match: Filter<EventListingDocument> = {
      sessions: {
        $elemMatch: {
          startsAt: { $gt: now },
          venue: { $ne: null },
          ...(cityKey ? { cityKey } : {}),
        },
      },
    };
    if (q) match.$text = { $search: q };
    if (category) match.category = category;

    // $text must stay in the first stage; sorting uses titleSortKey instead of collation (I-9).
    const [result] = await this.db
      .collection<EventListingDocument>(READ_STORE_COLLECTIONS.eventListing)
      .aggregate<{ items: EventListingDocument[]; total: Array<{ n: number }> }>([
        { $match: match as Document },
        {
          $addFields: {
            nextStartsAt: {
              $min: {
                $map: {
                  input: {
                    $filter: {
                      input: '$sessions',
                      as: 's',
                      cond: {
                        $and: [{ $gt: ['$$s.startsAt', now] }, { $ne: ['$$s.venue', null] }],
                      },
                    },
                  },
                  as: 's',
                  in: '$$s.startsAt',
                },
              },
            },
          },
        },
        { $sort: { nextStartsAt: 1, titleSortKey: 1, _id: 1 } },
        {
          $facet: {
            items: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
            total: [{ $count: 'n' }],
          },
        },
      ])
      .toArray();
    return { items: result?.items ?? [], total: result?.total[0]?.n ?? 0 };
  }

  findEventDetail(id: string): Promise<EventDetailDocument | EventDetailTombstone | null> {
    return this.db
      .collection<EventDetailDocument | EventDetailTombstone>(READ_STORE_COLLECTIONS.eventDetail)
      .findOne({ _id: id });
  }

  async listOrganizerEvents(
    organizerId: string,
    page: number,
    pageSize: number,
  ): Promise<Page<OrganizerEventDocument>> {
    const collection = this.db.collection<OrganizerEventDocument>(
      READ_STORE_COLLECTIONS.organizerEvents,
    );
    const [items, total] = await Promise.all([
      collection
        .find({ organizerId })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
      collection.countDocuments({ organizerId }),
    ]);
    return { items, total };
  }

  listVenues(organizerId: string): Promise<VenueDocument[]> {
    return this.db
      .collection<VenueDocument>(READ_STORE_COLLECTIONS.venues)
      .find({ organizerId })
      .toArray();
  }

  findVenue(id: string): Promise<VenueDocument | null> {
    return this.db.collection<VenueDocument>(READ_STORE_COLLECTIONS.venues).findOne({ _id: id });
  }
}
