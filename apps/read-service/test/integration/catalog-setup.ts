import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import {
  type EventDetailDocument,
  type EventDetailSession,
  type EventListingDocument,
  READ_STORE_COLLECTIONS,
} from '@stubb/contracts';
import { MongoClient } from 'mongodb';
import { Clock } from '../../src/common/clock.js';
import { CatalogModule } from '../../src/catalog/catalog.module.js';
import { SEED_ORGANIZER_ID } from '../../src/catalog/seed-organizer.js';
import { MongoModule } from '../../src/mongo/mongo.module.js';

export const MONGO_URL =
  process.env.MONGO_TEST_URL ?? 'mongodb://localhost:58018/?directConnection=true';
export const OWNER = '0193a4f0-0000-7000-8000-000000000001';
export const OTHER_OWNER = '0193a4f0-0000-7000-8000-0000000000aa';

export const NOW = new Date('2026-11-01T12:00:00.000Z');

export interface CatalogTestContext {
  app: INestApplication;
  client: MongoClient;
  server: () => Server;
  setNow: (date: Date) => void;
  close: () => Promise<void>;
}

export async function createCatalogApp(dbName: string): Promise<CatalogTestContext> {
  const client = await new MongoClient(MONGO_URL).connect();
  let current = NOW;
  const moduleRef = await Test.createTestingModule({
    imports: [CqrsModule.forRoot(), MongoModule.forRoot({ url: MONGO_URL, dbName }), CatalogModule],
  })
    .overrideProvider(Clock)
    .useValue({ now: () => current })
    .overrideProvider(SEED_ORGANIZER_ID)
    .useValue(OWNER)
    .compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api', { exclude: ['health'] });
  await app.init();
  return {
    app,
    client,
    server: () => app.getHttpServer() as Server,
    setNow: (date) => {
      current = date;
    },
    close: async () => {
      await app.close();
      await client.db(dbName).dropDatabase();
      await client.close();
    },
  };
}

// The indexes the real stack creates in mongo-init; the tests create the ones they use.
export async function createListingIndexes(client: MongoClient, dbName: string): Promise<void> {
  const collection = client.db(dbName).collection(READ_STORE_COLLECTIONS.eventListing);
  await collection.createIndex(
    { title: 'text' },
    { name: 'event_listing_title_text', default_language: 'portuguese' },
  );
  await collection.createIndex({ category: 1 }, { name: 'event_listing_category' });
  await collection.createIndex(
    { 'sessions.cityKey': 1 },
    { name: 'event_listing_sessions_city_key' },
  );
  await collection.createIndex(
    { 'sessions.startsAt': 1 },
    { name: 'event_listing_sessions_starts_at' },
  );
}

let sequence = 0;
// Valid UUIDv7-shaped ids (Zod's uuid() checks version and variant).
export function uid(n?: number): string {
  const value = n ?? ++sequence + 5000;
  return `0190a0a0-0000-7000-8000-${String(value).padStart(12, '0')}`;
}

export function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

const day = (n: number): Date => new Date(NOW.getTime() + n * 86_400_000);
export { day };

type ListingSession = EventListingDocument['sessions'][number];

export function listingSession(
  overrides: Partial<ListingSession> & { id: string },
): ListingSession {
  return {
    venueId: '0190a0a0-0000-7000-8000-0000000000e1',
    startsAt: day(30),
    salesStartsAt: day(-10),
    timeZone: 'America/Sao_Paulo',
    venue: { name: 'Teatro Central', city: 'São Paulo', state: 'SP' },
    cityKey: 'sao paulo',
    sectors: [{ id: uid(), batches: [{ priceCents: 5000, endsAt: null, position: 0 }] }],
    ...overrides,
  };
}

export function listingDoc(
  overrides: Partial<EventListingDocument> & { _id: string },
): EventListingDocument {
  return {
    organizerId: OWNER,
    version: 1,
    title: 'Evento',
    titleSortKey: 'evento',
    category: 'show',
    imageUrl: null,
    sessions: [listingSession({ id: uid() })],
    ...overrides,
  };
}

export function detailSession(
  overrides: Partial<EventDetailSession> & { id: string },
): EventDetailSession {
  return {
    status: 'published',
    venueId: '0190a0a0-0000-7000-8000-0000000000e1',
    venue: {
      name: 'Teatro Central',
      address: 'Rua A, 1',
      city: 'São Paulo',
      state: 'SP',
      cityKey: 'sao paulo',
      detailsVersion: 1,
    },
    startsAt: day(30),
    salesStartsAt: day(-10),
    timeZone: 'America/Sao_Paulo',
    sectors: [],
    ...overrides,
  };
}

export function detailDoc(
  overrides: Partial<EventDetailDocument> & { _id: string },
): EventDetailDocument {
  return {
    organizerId: OWNER,
    version: 1,
    status: 'published',
    title: 'Evento',
    description: 'Descrição',
    category: 'show',
    ageRating: 'L',
    imageUrl: null,
    sessions: [],
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}
