import { z } from 'zod';
import { uuidSchema } from '../shared/schemas.js';
import { PING_LABEL_MAX_LENGTH } from './constants.js';

export const pingLabelSchema = z
  .string()
  .trim()
  .min(1, 'Informe um rótulo')
  .max(PING_LABEL_MAX_LENGTH, `Use no máximo ${PING_LABEL_MAX_LENGTH} caracteres`);

export const CreatePingRequestSchema = z.object({ label: pingLabelSchema });
export const IncrementPingRequestSchema = z.object({});
export const CommandAcceptedSchema = z.object({ id: uuidSchema, version: z.number().int().min(1) });

export const PingViewSchema = z.object({
  id: uuidSchema,
  label: z.string(),
  count: z.number().int().min(0),
  version: z.number().int().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const GetPingResponseSchema = z.object({
  ping: PingViewSchema,
  minVersionReached: z.boolean(),
});

export const PingNotFoundResponseSchema = z.object({
  statusCode: z.literal(404),
  message: z.string(),
  minVersionReached: z.literal(false),
});

export type CreatePingRequest = z.output<typeof CreatePingRequestSchema>;
export type CreatePingRequestInput = z.input<typeof CreatePingRequestSchema>;
export type CommandAccepted = z.infer<typeof CommandAcceptedSchema>;
export type PingView = z.infer<typeof PingViewSchema>;
export type GetPingResponse = z.infer<typeof GetPingResponseSchema>;
export type PingNotFoundResponse = z.infer<typeof PingNotFoundResponseSchema>;
