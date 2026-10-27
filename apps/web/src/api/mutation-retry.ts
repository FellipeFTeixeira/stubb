import { ApiError } from './http';

// Retry só em erro de rede ou 5xx, até 2 vezes. A chave de idempotência vai nas variáveis
// da mutation, então todo retry reenvia a mesma chave.
export function shouldRetryCommand(failureCount: number, error: unknown): boolean {
  return (
    failureCount < 2 &&
    (error instanceof TypeError || (error instanceof ApiError && error.status >= 500))
  );
}

export const COMMAND_RETRY_DELAY_MS = 500;
