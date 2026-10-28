export const USER_ROLES = ['customer', 'organizer', 'admin', 'gate_staff'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ORGANIZER_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type OrganizerRequestStatus = (typeof ORGANIZER_REQUEST_STATUSES)[number];

export const JWT_ISSUER = 'stubb-identity';
export const JWT_AUDIENCE = 'stubb-api';
export const JWT_ALGORITHM = 'EdDSA';
export const JWT_CLOCK_TOLERANCE_SECONDS = 30;

export const ACCESS_TOKEN_TTL_SECONDS = 900;
export const REFRESH_TOKEN_TTL_SECONDS = 604800;

export const REFRESH_COOKIE_NAME = 'stubb_refresh';
export const REFRESH_COOKIE_PATH = '/api/identity/session';

export const EMAIL_VERIFICATION_TTL_SECONDS = 86400;
export const EMAIL_VERIFICATION_RESEND_INTERVAL_SECONDS = 60;

export const identityRoutes = {
  users: () => '/api/identity/users',
  confirmEmail: () => '/api/identity/email-verifications/confirm',
  emailVerifications: () => '/api/identity/email-verifications',
  session: () => '/api/identity/session',
  sessionRefresh: () => '/api/identity/session/refresh',
  me: () => '/api/identity/me',
  myOrganizerRequests: () => '/api/identity/me/organizer-requests',
  organizerRequests: () => '/api/identity/organizer-requests',
  adminOrganizerRequests: () => '/api/identity/admin/organizer-requests',
  approveOrganizerRequest: (requestId: string) =>
    `/api/identity/admin/organizer-requests/${requestId}/approve`,
  rejectOrganizerRequest: (requestId: string) =>
    `/api/identity/admin/organizer-requests/${requestId}/reject`,
} as const;

/** Valor do `scope` da idempotência: um por command. */
export const IDENTITY_ROUTE_TEMPLATES = {
  registerUser: 'POST /api/identity/users',
  requestOrganizerRole: 'POST /api/identity/organizer-requests',
  approveOrganizerRequest: 'POST /api/identity/admin/organizer-requests/:requestId/approve',
  rejectOrganizerRequest: 'POST /api/identity/admin/organizer-requests/:requestId/reject',
} as const;
