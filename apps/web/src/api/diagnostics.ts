import {
  CommandAcceptedSchema,
  GetPingResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  MIN_VERSION_QUERY_PARAM,
  diagnosticsRoutes,
  type CommandAccepted,
  type GetPingResponse,
} from '@stubb/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
    this.name = 'ApiError';
  }
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function postCommand(
  url: string,
  idempotencyKey: string,
  body: unknown,
): Promise<CommandAccepted> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    body: JSON.stringify(body),
  });
  const json = await readBody(response);
  if (response.status !== 202) throw new ApiError(response.status, json);
  return CommandAcceptedSchema.parse(json);
}

export function createPing(input: {
  label: string;
  idempotencyKey: string;
}): Promise<CommandAccepted> {
  return postCommand(diagnosticsRoutes.createPing, input.idempotencyKey, { label: input.label });
}

export function incrementPing(input: {
  id: string;
  idempotencyKey: string;
}): Promise<CommandAccepted> {
  return postCommand(diagnosticsRoutes.incrementPing(input.id), input.idempotencyKey, {});
}

export type GetPingResult = ({ status: 'found' } & GetPingResponse) | { status: 'not-found' };

export async function getPing(input: { id: string; minVersion?: number }): Promise<GetPingResult> {
  const query =
    input.minVersion === undefined ? '' : `?${MIN_VERSION_QUERY_PARAM}=${input.minVersion}`;
  const response = await fetch(`${diagnosticsRoutes.getPing(input.id)}${query}`);
  const json = await readBody(response);
  if (response.status === 200) return { status: 'found', ...GetPingResponseSchema.parse(json) };
  if (response.status === 404) return { status: 'not-found' };
  throw new ApiError(response.status, json);
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
