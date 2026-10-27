export const READ_STORE_COLLECTIONS = {
  pings: 'pings',
  processedEvents: 'processed_events',
  aggregateVersions: 'aggregate_versions',
  eventListing: 'event_listing',
  eventDetail: 'event_detail',
  organizerEvents: 'organizer_events',
  venues: 'venues',
} as const;

export const READ_STORE_COLLECTION_NAMES = Object.values(READ_STORE_COLLECTIONS);
