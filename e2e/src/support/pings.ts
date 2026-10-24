import { randomUUID } from 'node:crypto';
import { diagnosticsRoutes, type CommandAccepted } from '@stubb/contracts';
import { api } from './http.ts';

export const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const uniqueLabel = () => `e2e-${randomUUID()}`;

export async function createPing(label = uniqueLabel(), idempotencyKey = randomUUID()) {
  return api<CommandAccepted>('POST', diagnosticsRoutes.createPing, {
    body: { label },
    idempotencyKey,
  });
}

export async function incrementPing(id: string, idempotencyKey = randomUUID()) {
  return api<CommandAccepted>('POST', diagnosticsRoutes.incrementPing(id), {
    body: {},
    idempotencyKey,
  });
}

export interface PingRow {
  id: string;
  label: string;
  count: number;
  version: number;
}

export interface OutboxRow {
  aggregate_id: string;
  aggregate_version: string;
  event_type: string;
  bounded_context: string;
  payload: Record<string, unknown>;
}
