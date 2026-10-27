export const BOUNDED_CONTEXT_CATALOG = 'catalog';
export const CATALOG_TOPIC = 'catalog.events';
export const VENUE_AGGREGATE_TYPE = 'Venue';
export const EVENT_AGGREGATE_TYPE = 'Event';

export const CATALOG_EVENT_TYPES = {
  venueRegistered: 'VenueRegistered',
  venueDetailsUpdated: 'VenueDetailsUpdated',
  venueSectorAdded: 'VenueSectorAdded',
  venueSectorRemoved: 'VenueSectorRemoved',
  eventCreated: 'EventCreated',
  eventDetailsUpdated: 'EventDetailsUpdated',
  eventDiscarded: 'EventDiscarded',
  sessionScheduled: 'SessionScheduled',
  sessionRemoved: 'SessionRemoved',
  sessionSectorAdded: 'SessionSectorAdded',
  sessionSectorRemoved: 'SessionSectorRemoved',
  batchAdded: 'BatchAdded',
  batchRemoved: 'BatchRemoved',
  sessionPublished: 'SessionPublished',
} as const;

export const CATALOG_LIMITS = {
  venueNameMax: 100,
  venueAddressMax: 200,
  venueCityMax: 100,
  sectorNameMax: 50,
  sectorsPerVenueMax: 20,
  generalAdmissionCapacityMax: 50000,
  rowsPerSectorMax: 50,
  seatsPerRowMax: 100,
  eventTitleMax: 120,
  eventDescriptionMax: 5000,
  imageUrlMax: 2048,
  sessionsPerEventMax: 50,
  batchNameMax: 50,
  batchesPerSectorMax: 10,
  priceCentsMin: 1,
  priceCentsMax: 10000000,
} as const;

export const BRAZIL_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export const BRAZIL_TIME_ZONES = [
  'America/Noronha',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Araguaina',
  'America/Maceio',
  'America/Bahia',
  'America/Sao_Paulo',
  'America/Campo_Grande',
  'America/Cuiaba',
  'America/Santarem',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Manaus',
  'America/Eirunepe',
  'America/Rio_Branco',
] as const;

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

export const EVENT_CATEGORIES = [
  'show',
  'theater',
  'stand_up',
  'sports',
  'festival',
  'kids',
  'other',
] as const;
export const AGE_RATINGS = ['L', '10', '12', '14', '16', '18'] as const;
export const SECTOR_KINDS = ['general_admission', 'seated'] as const;

export const CATALOG_PAGE_SIZE = { default: 12, max: 48 } as const;

export const catalogRoutes = {
  venues: '/api/catalog/venues',
  venue: (venueId: string) => `/api/catalog/venues/${venueId}`,
  venueSectors: (venueId: string) => `/api/catalog/venues/${venueId}/sectors`,
  venueSector: (venueId: string, venueSectorId: string) =>
    `/api/catalog/venues/${venueId}/sectors/${venueSectorId}`,
  events: '/api/catalog/events',
  event: (eventId: string) => `/api/catalog/events/${eventId}`,
  sessions: (eventId: string) => `/api/catalog/events/${eventId}/sessions`,
  session: (eventId: string, sessionId: string) =>
    `/api/catalog/events/${eventId}/sessions/${sessionId}`,
  publishSession: (eventId: string, sessionId: string) =>
    `/api/catalog/events/${eventId}/sessions/${sessionId}/publish`,
  sessionSectors: (eventId: string, sessionId: string) =>
    `/api/catalog/events/${eventId}/sessions/${sessionId}/sectors`,
  sessionSector: (eventId: string, sessionId: string, sessionSectorId: string) =>
    `/api/catalog/events/${eventId}/sessions/${sessionId}/sectors/${sessionSectorId}`,
  batches: (eventId: string, sessionId: string, sessionSectorId: string) =>
    `/api/catalog/events/${eventId}/sessions/${sessionId}/sectors/${sessionSectorId}/batches`,
  batch: (eventId: string, sessionId: string, sessionSectorId: string, batchId: string) =>
    `/api/catalog/events/${eventId}/sessions/${sessionId}/sectors/${sessionSectorId}/batches/${batchId}`,
  organizerEvents: '/api/catalog/organizer/events',
  organizerEvent: (eventId: string) => `/api/catalog/organizer/events/${eventId}`,
  organizerVenues: '/api/catalog/organizer/venues',
  organizerVenue: (venueId: string) => `/api/catalog/organizer/venues/${venueId}`,
} as const;

/** Valor do `scope` da idempotência: um por command. */
export const CATALOG_ROUTE_TEMPLATES = {
  registerVenue: 'POST /api/catalog/venues',
  updateVenueDetails: 'PATCH /api/catalog/venues/:venueId',
  addVenueSector: 'POST /api/catalog/venues/:venueId/sectors',
  removeVenueSector: 'DELETE /api/catalog/venues/:venueId/sectors/:venueSectorId',
  createEvent: 'POST /api/catalog/events',
  updateEventDetails: 'PATCH /api/catalog/events/:eventId',
  discardEvent: 'DELETE /api/catalog/events/:eventId',
  scheduleSession: 'POST /api/catalog/events/:eventId/sessions',
  removeSession: 'DELETE /api/catalog/events/:eventId/sessions/:sessionId',
  publishSession: 'POST /api/catalog/events/:eventId/sessions/:sessionId/publish',
  addSessionSector: 'POST /api/catalog/events/:eventId/sessions/:sessionId/sectors',
  removeSessionSector:
    'DELETE /api/catalog/events/:eventId/sessions/:sessionId/sectors/:sessionSectorId',
  addBatch:
    'POST /api/catalog/events/:eventId/sessions/:sessionId/sectors/:sessionSectorId/batches',
  removeBatch:
    'DELETE /api/catalog/events/:eventId/sessions/:sessionId/sectors/:sessionSectorId/batches/:batchId',
} as const;
