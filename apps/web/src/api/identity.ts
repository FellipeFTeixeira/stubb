import {
  IdentityCommandAcceptedSchema,
  ListAdminOrganizerRequestsResponseSchema,
  ListMyOrganizerRequestsResponseSchema,
  LoginRequestSchema,
  MeResponseSchema,
  RegisterUserRequestSchema,
  RequestOrganizerRoleRequestSchema,
  SessionResponseSchema,
  identityRoutes,
  type IdentityCommandAccepted,
  type ListAdminOrganizerRequestsQuery,
  type ListAdminOrganizerRequestsResponse,
  type ListMyOrganizerRequestsResponse,
  type MeResponse,
} from '@stubb/contracts';
import { z } from 'zod';
import { setAccessToken } from './auth-session';
import { ApiError, sendJson, withQuery } from './http';

export { ApiError };

// As entradas são o `z.input` dos schemas de contrato: o formulário manda o texto cru (CPF com
// máscara, e-mail com maiúsculas) e o servidor normaliza.
export type RegisterUserInput = z.input<typeof RegisterUserRequestSchema>;
export type LoginInput = z.input<typeof LoginRequestSchema>;
export type RequestOrganizerRoleInput = z.input<typeof RequestOrganizerRoleRequestSchema>;
export type AdminOrganizerRequestsParams = Partial<ListAdminOrganizerRequestsQuery>;

export function registerUser(
  input: RegisterUserInput,
  idempotencyKey: string,
): Promise<IdentityCommandAccepted> {
  return sendJson('POST', identityRoutes.users(), input, IdentityCommandAcceptedSchema, {
    idempotencyKey,
    expectedStatus: 202,
  });
}

export function confirmEmail(token: string): Promise<IdentityCommandAccepted> {
  return sendJson('POST', identityRoutes.confirmEmail(), { token }, IdentityCommandAcceptedSchema, {
    expectedStatus: 202,
  });
}

export async function resendVerification(email: string): Promise<void> {
  await sendJson('POST', identityRoutes.emailVerifications(), { email }, z.unknown(), {
    expectedStatus: 202,
  });
}

// Um 401 aqui é "credenciais inválidas", não token vencido: não tenta renovar a sessão.
export async function login(input: LoginInput): Promise<void> {
  const session = await sendJson('POST', identityRoutes.session(), input, SessionResponseSchema, {
    expectedStatus: 200,
    refreshOn401: false,
  });
  setAccessToken(session.accessToken);
}

export async function logout(): Promise<void> {
  await sendJson('DELETE', identityRoutes.session(), undefined, z.null(), {
    expectedStatus: 204,
    refreshOn401: false,
  });
}

export function getMe(): Promise<MeResponse> {
  return sendJson('GET', identityRoutes.me(), undefined, MeResponseSchema, {
    expectedStatus: 200,
  });
}

export function requestOrganizerRole(
  input: RequestOrganizerRoleInput,
  idempotencyKey: string,
): Promise<IdentityCommandAccepted> {
  return sendJson(
    'POST',
    identityRoutes.organizerRequests(),
    input,
    IdentityCommandAcceptedSchema,
    {
      idempotencyKey,
      expectedStatus: 202,
    },
  );
}

export function listMyOrganizerRequests(): Promise<ListMyOrganizerRequestsResponse> {
  return sendJson(
    'GET',
    identityRoutes.myOrganizerRequests(),
    undefined,
    ListMyOrganizerRequestsResponseSchema,
    { expectedStatus: 200 },
  );
}

export function listAdminOrganizerRequests(
  params: AdminOrganizerRequestsParams = {},
): Promise<ListAdminOrganizerRequestsResponse> {
  return sendJson(
    'GET',
    withQuery(identityRoutes.adminOrganizerRequests(), params),
    undefined,
    ListAdminOrganizerRequestsResponseSchema,
    { expectedStatus: 200 },
  );
}

export function approveOrganizerRequest(
  id: string,
  idempotencyKey: string,
): Promise<IdentityCommandAccepted> {
  return sendJson(
    'POST',
    identityRoutes.approveOrganizerRequest(id),
    {},
    IdentityCommandAcceptedSchema,
    { idempotencyKey, expectedStatus: 202 },
  );
}

export function rejectOrganizerRequest(
  id: string,
  message: string | undefined,
  idempotencyKey: string,
): Promise<IdentityCommandAccepted> {
  return sendJson(
    'POST',
    identityRoutes.rejectOrganizerRequest(id),
    message === undefined ? {} : { message },
    IdentityCommandAcceptedSchema,
    { idempotencyKey, expectedStatus: 202 },
  );
}
