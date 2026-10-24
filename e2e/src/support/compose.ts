import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const COMPOSE_FILE = path.resolve(import.meta.dirname, '../../../infra/compose.yaml');

export function compose(...args: string[]): string {
  return execFileSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
