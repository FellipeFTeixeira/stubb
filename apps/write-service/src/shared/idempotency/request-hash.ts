import { createHash } from 'node:crypto';

export function hashRequest(method: string, path: string, body: unknown): string {
  return createHash('sha256').update(JSON.stringify({ method, path, body })).digest('hex');
}
