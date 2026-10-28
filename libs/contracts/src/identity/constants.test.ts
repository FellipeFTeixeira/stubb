import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  EMAIL_VERIFICATION_RESEND_INTERVAL_SECONDS,
  EMAIL_VERIFICATION_TTL_SECONDS,
  IDENTITY_ROUTE_TEMPLATES,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_CLOCK_TOLERANCE_SECONDS,
  JWT_ISSUER,
  ORGANIZER_REQUEST_STATUSES,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
  USER_ROLES,
  identityRoutes,
} from '../index.js';

describe('constantes da Identity', () => {
  it('papéis e status', () => {
    expect(USER_ROLES).toEqual(['customer', 'organizer', 'admin', 'gate_staff']);
    expect(ORGANIZER_REQUEST_STATUSES).toEqual(['pending', 'approved', 'rejected']);
  });

  it('parâmetros do JWT, do refresh e da verificação', () => {
    expect(JWT_ISSUER).toBe('stubb-identity');
    expect(JWT_AUDIENCE).toBe('stubb-api');
    expect(JWT_ALGORITHM).toBe('EdDSA');
    expect(JWT_CLOCK_TOLERANCE_SECONDS).toBe(30);
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(604800);
    expect(REFRESH_COOKIE_NAME).toBe('stubb_refresh');
    expect(REFRESH_COOKIE_PATH).toBe('/api/identity/session');
    expect(EMAIL_VERIFICATION_TTL_SECONDS).toBe(86400);
    expect(EMAIL_VERIFICATION_RESEND_INTERVAL_SECONDS).toBe(60);
  });

  it('caminhos das rotas', () => {
    expect(identityRoutes.users()).toBe('/api/identity/users');
    expect(identityRoutes.confirmEmail()).toBe('/api/identity/email-verifications/confirm');
    expect(identityRoutes.emailVerifications()).toBe('/api/identity/email-verifications');
    expect(identityRoutes.session()).toBe('/api/identity/session');
    expect(identityRoutes.sessionRefresh()).toBe('/api/identity/session/refresh');
    expect(identityRoutes.me()).toBe('/api/identity/me');
    expect(identityRoutes.myOrganizerRequests()).toBe('/api/identity/me/organizer-requests');
    expect(identityRoutes.organizerRequests()).toBe('/api/identity/organizer-requests');
    expect(identityRoutes.adminOrganizerRequests()).toBe('/api/identity/admin/organizer-requests');
    expect(identityRoutes.approveOrganizerRequest('r1')).toBe(
      '/api/identity/admin/organizer-requests/r1/approve',
    );
    expect(identityRoutes.rejectOrganizerRequest('r1')).toBe(
      '/api/identity/admin/organizer-requests/r1/reject',
    );
  });

  it('o cookie de refresh cobre as rotas de sessão', () => {
    expect(identityRoutes.session().startsWith(REFRESH_COOKIE_PATH)).toBe(true);
    expect(identityRoutes.sessionRefresh().startsWith(REFRESH_COOKIE_PATH)).toBe(true);
  });

  it('templates de idempotência', () => {
    expect(IDENTITY_ROUTE_TEMPLATES).toEqual({
      registerUser: 'POST /api/identity/users',
      requestOrganizerRole: 'POST /api/identity/organizer-requests',
      approveOrganizerRequest: 'POST /api/identity/admin/organizer-requests/:requestId/approve',
      rejectOrganizerRequest: 'POST /api/identity/admin/organizer-requests/:requestId/reject',
    });
  });
});
