import {
  CommandAcceptedSchema,
  GetPingResponseSchema,
  MIN_VERSION_QUERY_PARAM,
  diagnosticsRoutes,
  type CommandAccepted,
  type GetPingResponse,
} from '@stubb/contracts';
import { ApiError, getJson, sendCommand, withQuery } from './http';

export { ApiError };

export function createPing(input: {
  label: string;
  idempotencyKey: string;
}): Promise<CommandAccepted> {
  return sendCommand(
    'POST',
    diagnosticsRoutes.createPing,
    input.idempotencyKey,
    { label: input.label },
    CommandAcceptedSchema,
  );
}

export function incrementPing(input: {
  id: string;
  idempotencyKey: string;
}): Promise<CommandAccepted> {
  return sendCommand(
    'POST',
    diagnosticsRoutes.incrementPing(input.id),
    input.idempotencyKey,
    {},
    CommandAcceptedSchema,
  );
}

export type GetPingResult = ({ status: 'found' } & GetPingResponse) | { status: 'not-found' };

export async function getPing(input: { id: string; minVersion?: number }): Promise<GetPingResult> {
  const result = await getJson(
    withQuery(diagnosticsRoutes.getPing(input.id), {
      [MIN_VERSION_QUERY_PARAM]: input.minVersion,
    }),
    GetPingResponseSchema,
  );
  return result.status === 'found' ? { status: 'found', ...result.data } : { status: 'not-found' };
}

export function describeCommandError(error: unknown): string {
  if (error instanceof TypeError) return 'Sem conexão com o servidor. Tente novamente.';
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return 'Requisição inválida.';
      case 404:
        return 'Ping não encontrado.';
      case 409:
        return 'Conflito de concorrência. Tente novamente.';
      case 422:
        return 'A chave de idempotência já foi usada em outro pedido.';
      default:
        return `Falha ao enviar o comando (HTTP ${error.status}).`;
    }
  }
  return 'Falha ao enviar o comando.';
}
