import { z } from 'zod';
import { uuidSchema } from '../shared/schemas.js';

export const CommandAcceptedSchema = z.object({ id: uuidSchema, version: z.number().int().min(1) });
export const EntityCommandAcceptedSchema = CommandAcceptedSchema.extend({ entityId: uuidSchema });

export type CommandAccepted = z.infer<typeof CommandAcceptedSchema>;
export type EntityCommandAccepted = z.infer<typeof EntityCommandAcceptedSchema>;
