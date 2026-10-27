/* global rs, db, sleep, print */
// mongosh globals
try {
  rs.status();
} catch {
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] });
}

let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  if (db.hello().isWritablePrimary) {
    ready = true;
    break;
  }
  sleep(500);
}
if (!ready) {
  throw new Error('replica set rs0 did not elect a primary in time');
}

const readDb = db.getSiblingDB('stubb_read');
const existing = readDb.getCollectionNames();
// Espelha READ_STORE_COLLECTIONS de @stubb/contracts (este script não importa TS).
const collections = [
  'pings',
  'processed_events',
  'aggregate_versions',
  'event_listing',
  'event_detail',
  'organizer_events',
  'venues',
];
for (const name of collections) {
  if (!existing.includes(name)) {
    readDb.createCollection(name);
  }
}

// createIndex é idempotente: repetir com a mesma definição e o mesmo nome não faz nada.
readDb.event_listing.createIndex(
  { title: 'text' },
  { name: 'event_listing_title_text', default_language: 'portuguese' },
);
readDb.event_listing.createIndex({ category: 1 }, { name: 'event_listing_category' });
readDb.event_listing.createIndex(
  { 'sessions.cityKey': 1 },
  { name: 'event_listing_sessions_city_key' },
);
readDb.event_listing.createIndex(
  { 'sessions.startsAt': 1 },
  { name: 'event_listing_sessions_starts_at' },
);
readDb.event_listing.createIndex(
  { 'sessions.venueId': 1 },
  { name: 'event_listing_sessions_venue_id' },
);
readDb.event_detail.createIndex(
  { 'sessions.venueId': 1 },
  { name: 'event_detail_sessions_venue_id' },
);
readDb.organizer_events.createIndex(
  { organizerId: 1, createdAt: -1, _id: -1 },
  { name: 'organizer_events_by_organizer' },
);
readDb.venues.createIndex({ organizerId: 1, name: 1 }, { name: 'venues_by_organizer' });
print('mongo-init: replica set rs0 ready, collections and indexes ensured');
