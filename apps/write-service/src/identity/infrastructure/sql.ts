import { type EntityManager, type QueryResult, QueryFailedError } from 'typeorm';

// `EntityManager.query` não devolve o resultado estruturado (UPDATE ... RETURNING); o QueryRunner da
// transação devolve. Só funciona dentro de `TransactionContext.run`.
export async function queryRecords<T>(
  manager: EntityManager,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const queryRunner = manager.queryRunner;
  if (!queryRunner) throw new Error('No active transaction');
  const result = (await queryRunner.query(sql, params, true)) as QueryResult<T>;
  return result.records;
}

// Nome da constraint violada (SQLSTATE 23505), ou null se o erro for outro.
export function uniqueViolation(error: unknown): string | null {
  if (!(error instanceof QueryFailedError)) return null;
  const driverError = error.driverError as { code?: string; constraint?: string } | undefined;
  return driverError?.code === '23505' ? (driverError.constraint ?? '') : null;
}
