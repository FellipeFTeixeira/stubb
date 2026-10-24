import { Injectable } from '@nestjs/common';
import type { QueryResult } from 'typeorm';
import { IdempotencyKeyMismatchError } from '../errors.js';
import { TransactionContext } from '../transaction/transaction-context.js';

export interface IdempotencyInput {
  key: string;
  scope: string;
  requestHash: string;
}

const RESERVE_SQL = `
INSERT INTO idempotency_keys (key, scope, request_hash, created_at) VALUES ($1, $2, $3, now())
ON CONFLICT (key, scope) DO UPDATE
  SET request_hash = EXCLUDED.request_hash, response_status = NULL, response_body = NULL, created_at = now()
  WHERE idempotency_keys.created_at < now() - interval '24 hours'
RETURNING key`;

@Injectable()
export class IdempotencyService {
  constructor(private readonly transactionContext: TransactionContext) {}

  // Reserva da chave, command e resposta salva na mesma transação (RN-2, RN-12, RN-13).
  execute<T>(input: IdempotencyInput, operation: () => Promise<T>): Promise<T> {
    return this.transactionContext.run(async () => {
      // EntityManager.query não expõe o resultado estruturado; o QueryRunner da transação expõe.
      const queryRunner = this.transactionContext.manager().queryRunner;
      if (!queryRunner) throw new Error('No active transaction');
      const { key, scope, requestHash } = input;

      // Uma requisição concorrente com a mesma chave bloqueia neste INSERT até a primeira terminar.
      const reserved = (await queryRunner.query(
        RESERVE_SQL,
        [key, scope, requestHash],
        true,
      )) as QueryResult<{ key: string }>;

      if (reserved.records.length === 0) {
        const saved = (await queryRunner.query(
          'SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE key = $1 AND scope = $2',
          [key, scope],
        )) as Array<{ request_hash: string; response_body: T }>;
        const row = saved[0];
        if (!row || row.request_hash !== requestHash) throw new IdempotencyKeyMismatchError();
        return row.response_body;
      }

      const result = await operation();
      await queryRunner.query(
        'UPDATE idempotency_keys SET response_status = 202, response_body = $3 WHERE key = $1 AND scope = $2',
        [key, scope, JSON.stringify(result)],
      );
      return result;
    });
  }
}
