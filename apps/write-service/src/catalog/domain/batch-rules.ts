import { CATALOG_LIMITS } from '@stubb/contracts';
import { BusinessRuleViolationError } from '../../shared/errors.js';
import { toNameKey } from './venue.aggregate.js';

export interface BatchRuleInput {
  name: string;
  quantity: number | null;
  endsAt: Date | null;
}

export interface BatchRuleContext {
  capacity: number;
  salesStartsAt: Date;
  startsAt: Date;
}

// Regras RN-25 a RN-28 para um lote entrar no fim da sequência. É a mesma função no AddBatch e
// na publicação (que reaplica a sequência inteira), então as duas nunca divergem.
export function assertBatchCanAppend(
  existing: readonly BatchRuleInput[],
  candidate: BatchRuleInput,
  context: BatchRuleContext,
): void {
  if (existing.length >= CATALOG_LIMITS.batchesPerSectorMax) {
    throw new BusinessRuleViolationError('BATCH_LIMIT_REACHED');
  }
  const nameKey = toNameKey(candidate.name);
  if (existing.some((batch) => toNameKey(batch.name) === nameKey)) {
    throw new BusinessRuleViolationError('BATCH_NAME_TAKEN');
  }
  const quantities = existing.reduce((total, batch) => total + (batch.quantity ?? 0), 0);
  if (candidate.quantity !== null && quantities + candidate.quantity > context.capacity) {
    throw new BusinessRuleViolationError('BATCH_QUANTITY_EXCEEDS_CAPACITY');
  }
  if (candidate.endsAt !== null) {
    const endsAt = candidate.endsAt.getTime();
    if (endsAt <= context.salesStartsAt.getTime() || endsAt >= context.startsAt.getTime()) {
      throw new BusinessRuleViolationError('BATCH_END_OUT_OF_RANGE');
    }
    const previousDates = existing.flatMap((batch) =>
      batch.endsAt ? [batch.endsAt.getTime()] : [],
    );
    if (previousDates.some((previous) => endsAt <= previous)) {
      throw new BusinessRuleViolationError('BATCH_END_BEFORE_PREVIOUS');
    }
  }
  const last = existing.at(-1);
  if (last && last.quantity === null && last.endsAt === null) {
    throw new BusinessRuleViolationError('PREVIOUS_BATCH_UNBOUNDED');
  }
}

// Reaplica as regras de lote sobre a sequência já cadastrada de um setor.
export function assertBatchSequence(
  batches: readonly BatchRuleInput[],
  context: BatchRuleContext,
): void {
  batches.forEach((batch, index) => {
    assertBatchCanAppend(batches.slice(0, index), batch, context);
  });
}
