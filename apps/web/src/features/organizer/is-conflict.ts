import { describeCommandError } from '@/api/command-errors';
import { ApiError } from '@/api/http';

export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === 'CONCURRENCY_CONFLICT';
}

// Mensagem do CA-44, vinda da mesma tabela de códigos do restante do web.
export const CONFLICT_MESSAGE = describeCommandError(
  new ApiError(409, { code: 'CONCURRENCY_CONFLICT' }),
);
