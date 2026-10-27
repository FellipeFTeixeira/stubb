import { z } from 'zod';

export const uuidSchema = z.uuid();
export const idempotencyKeySchema = z.uuid();
export const minVersionSchema = z.coerce.number().int().min(1);
export const instantSchema = z.iso.datetime({ offset: true });
