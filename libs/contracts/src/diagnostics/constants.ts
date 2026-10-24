export const BOUNDED_CONTEXT_DIAGNOSTICS = 'diagnostics';
export const DIAGNOSTICS_TOPIC = 'diagnostics.events';
export const PING_AGGREGATE_TYPE = 'Ping';
export const PING_EVENT_TYPES = { created: 'PingCreated', incremented: 'PingIncremented' } as const;
export const PING_LABEL_MAX_LENGTH = 50;

export const diagnosticsRoutes = {
  createPing: '/api/diagnostics/pings',
  incrementPing: (id: string) => `/api/diagnostics/pings/${id}/increment`,
  getPing: (id: string) => `/api/diagnostics/pings/${id}`,
};

// Valor de `scope` da idempotência.
export const DIAGNOSTICS_ROUTE_TEMPLATES = {
  createPing: 'POST /api/diagnostics/pings',
  incrementPing: 'POST /api/diagnostics/pings/:id/increment',
} as const;
