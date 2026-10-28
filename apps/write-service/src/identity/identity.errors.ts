import type { CommandErrorCode } from '@stubb/contracts';

export type IdentityErrorStatus = 401 | 403 | 404 | 409 | 422;

// Erro de regra da Identity: o IdentityErrorFilter responde com o status e o `code` do contrato.
export class IdentityError extends Error {
  constructor(
    readonly code: CommandErrorCode,
    readonly status: IdentityErrorStatus,
    message: string,
  ) {
    super(message);
    this.name = 'IdentityError';
  }
}

export const invalidCredentials = () =>
  new IdentityError('INVALID_CREDENTIALS', 401, 'E-mail ou senha inválidos');

export const sessionInvalid = () => new IdentityError('SESSION_INVALID', 401, 'Sessão inválida');

export const verificationTokenInvalid = () =>
  new IdentityError('VERIFICATION_TOKEN_INVALID', 422, 'Link inválido ou vencido');
