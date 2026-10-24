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
