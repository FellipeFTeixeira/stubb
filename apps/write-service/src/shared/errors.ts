import type { CommandErrorCode } from '@stubb/contracts';

export class ConcurrencyConflictError extends Error {
  constructor(aggregateId: string) {
    super(`Concurrent modification of aggregate ${aggregateId}`);
    this.name = 'ConcurrencyConflictError';
  }
}

export class AggregateNotFoundError extends Error {
  constructor(message = 'Aggregate not found') {
    super(message);
    this.name = 'AggregateNotFoundError';
  }
}

export class IdempotencyKeyMismatchError extends Error {
  constructor() {
    super('Idempotency-Key was already used with a different request');
    this.name = 'IdempotencyKeyMismatchError';
  }
}

// Violação de regra de negócio: o filtro responde 422 com o `code` do contrato.
export class BusinessRuleViolationError extends Error {
  constructor(
    readonly code: CommandErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'BusinessRuleViolationError';
  }
}

// Entidade filha (sessão, setor, lote) inexistente dentro de um agregado existente.
export class EntityNotFoundError extends Error {
  constructor(message = 'Entity not found') {
    super(message);
    this.name = 'EntityNotFoundError';
  }
}
