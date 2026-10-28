export const catalogKeys = {
  publicEvents: (filters: object) => ['catalog', 'public', 'events', filters] as const,
  publicEvent: (id: string) => ['catalog', 'public', 'event', id] as const,
  organizerEvents: ['catalog', 'organizer', 'events'] as const,
  organizerEvent: (id: string) => ['catalog', 'organizer', 'event', id] as const,
  organizerVenues: ['catalog', 'organizer', 'venues'] as const,
  organizerVenue: (id: string) => ['catalog', 'organizer', 'venue', id] as const,
};

export const identityKeys = {
  me: ['identity', 'me'] as const,
  myOrganizerRequests: ['identity', 'my-organizer-requests'] as const,
  adminOrganizerRequests: (params: object) =>
    ['identity', 'admin-organizer-requests', params] as const,
};
