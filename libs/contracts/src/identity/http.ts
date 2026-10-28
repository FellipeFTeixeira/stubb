import { z } from 'zod';
import { instantSchema, uuidSchema } from '../shared/schemas.js';
import { JWT_AUDIENCE, JWT_ISSUER, ORGANIZER_REQUEST_STATUSES, USER_ROLES } from './constants.js';
import { isValidCnpj, isValidCpf, normalizeCnpj, normalizeCpf } from './documents.js';

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

const codePointCount = (s: string): number => [...s].length;

const passwordSchema = z
  .string()
  .refine((s) => codePointCount(s) >= 8, 'Mínimo 8 caracteres')
  .refine((s) => codePointCount(s) <= 128, 'Máximo 128 caracteres');

const cpfSchema = z.string().transform(normalizeCpf).refine(isValidCpf, 'CPF inválido');
const cnpjSchema = z.string().transform(normalizeCnpj).refine(isValidCnpj, 'CNPJ inválido');

// Commands

export const RegisterUserRequestSchema = z.object({
  fullName: z.string().trim().min(3, 'Mínimo 3 caracteres').max(120, 'Máximo 120 caracteres'),
  email: emailSchema,
  password: passwordSchema,
  cpf: cpfSchema,
});

export const ConfirmEmailRequestSchema = z.object({
  token: z.string().trim().min(1, 'Campo obrigatório').max(200),
});

export const ResendVerificationRequestSchema = z.object({ email: emailSchema });

export const LoginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Campo obrigatório').max(128),
});

export const RequestOrganizerRoleRequestSchema = z.object({
  organizationName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120'),
  cnpj: cnpjSchema,
  reason: z.string().trim().min(1, 'Campo obrigatório').max(500, 'Máximo 500 caracteres'),
});

export const RejectOrganizerRequestRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .max(500, 'Máximo 500 caracteres')
    .optional()
    .transform((v) => (v ? v : undefined)),
});

// Responses

export const SessionResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
});

export const IdentityCommandAcceptedSchema = z.object({ id: uuidSchema });

export const MeResponseSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  fullName: z.string(),
  cpf: z.string(),
  roles: z.array(z.enum(USER_ROLES)),
});

export const OrganizerRequestViewSchema = z.object({
  id: uuidSchema,
  organizationName: z.string(),
  cnpj: z.string(),
  reason: z.string(),
  status: z.enum(ORGANIZER_REQUEST_STATUSES),
  rejectionMessage: z.string().nullable(),
  createdAt: instantSchema,
  decidedAt: instantSchema.nullable(),
});

export const AdminOrganizerRequestViewSchema = OrganizerRequestViewSchema.extend({
  requester: z.object({ id: uuidSchema, fullName: z.string(), email: z.string() }),
});

export const ListMyOrganizerRequestsResponseSchema = z.object({
  items: z.array(OrganizerRequestViewSchema),
});

// Queries

export const ListAdminOrganizerRequestsQuerySchema = z.object({
  status: z.enum(ORGANIZER_REQUEST_STATUSES).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const ListAdminOrganizerRequestsResponseSchema = z.object({
  items: z.array(AdminOrganizerRequestViewSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

// Access token

export const AccessTokenClaimsSchema = z.object({
  sub: uuidSchema,
  roles: z.array(z.enum(USER_ROLES)).min(1),
  iss: z.literal(JWT_ISSUER),
  aud: z.literal(JWT_AUDIENCE),
  iat: z.number().int(),
  exp: z.number().int(),
});

export type RegisterUserRequest = z.infer<typeof RegisterUserRequestSchema>;
export type ConfirmEmailRequest = z.infer<typeof ConfirmEmailRequestSchema>;
export type ResendVerificationRequest = z.infer<typeof ResendVerificationRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RequestOrganizerRoleRequest = z.infer<typeof RequestOrganizerRoleRequestSchema>;
export type RejectOrganizerRequestRequest = z.infer<typeof RejectOrganizerRequestRequestSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type IdentityCommandAccepted = z.infer<typeof IdentityCommandAcceptedSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
export type OrganizerRequestView = z.infer<typeof OrganizerRequestViewSchema>;
export type AdminOrganizerRequestView = z.infer<typeof AdminOrganizerRequestViewSchema>;
export type ListMyOrganizerRequestsResponse = z.infer<typeof ListMyOrganizerRequestsResponseSchema>;
export type ListAdminOrganizerRequestsQuery = z.infer<typeof ListAdminOrganizerRequestsQuerySchema>;
export type ListAdminOrganizerRequestsResponse = z.infer<
  typeof ListAdminOrganizerRequestsResponseSchema
>;
export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;
