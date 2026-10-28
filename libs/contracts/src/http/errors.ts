import { z } from 'zod';

export const COMMAND_ERROR_CODES = [
  'VALIDATION_FAILED',
  'IDEMPOTENCY_KEY_INVALID',
  'IDEMPOTENCY_KEY_MISMATCH',
  'CONCURRENCY_CONFLICT',
  'AGGREGATE_NOT_FOUND',
  'ENTITY_NOT_FOUND',
  'VENUE_SECTOR_LIMIT_REACHED',
  'VENUE_SECTOR_NAME_TAKEN',
  'EVENT_NOT_DRAFT',
  'VENUE_NOT_FOUND',
  'VENUE_TIME_ZONE_CHANGED',
  'VENUE_WITHOUT_SECTORS',
  'SESSION_LIMIT_REACHED',
  'SESSION_START_NOT_IN_FUTURE',
  'SESSION_DUPLICATED',
  'SESSION_NOT_DRAFT',
  'VENUE_SECTOR_NOT_FOUND',
  'SESSION_SECTOR_ALREADY_PRESENT',
  'SESSION_SECTOR_NAME_TAKEN',
  'BATCH_LIMIT_REACHED',
  'BATCH_NAME_TAKEN',
  'BATCH_QUANTITY_EXCEEDS_CAPACITY',
  'BATCH_END_OUT_OF_RANGE',
  'BATCH_END_BEFORE_PREVIOUS',
  'PREVIOUS_BATCH_UNBOUNDED',
  'SESSION_WITHOUT_SECTORS',
  'SECTOR_WITHOUT_BATCH',
  'BATCH_ENDED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'EMAIL_ALREADY_REGISTERED',
  'CPF_ALREADY_REGISTERED',
  'VERIFICATION_TOKEN_INVALID',
  'INVALID_CREDENTIALS',
  'EMAIL_NOT_VERIFIED',
  'SESSION_INVALID',
  'ALREADY_ORGANIZER',
  'ORGANIZER_REQUEST_PENDING',
  'ORGANIZER_REQUEST_NOT_FOUND',
  'ORGANIZER_REQUEST_NOT_PENDING',
] as const;

export type CommandErrorCode = (typeof COMMAND_ERROR_CODES)[number];

export const ValidationErrorResponseSchema = z.object({
  statusCode: z.literal(400),
  error: z.literal('Bad Request'),
  message: z.literal('Validation failed'),
  code: z.literal('VALIDATION_FAILED'),
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
});

export const DomainErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  code: z.enum(COMMAND_ERROR_CODES),
});

export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponseSchema>;
export type DomainErrorResponse = z.infer<typeof DomainErrorResponseSchema>;
