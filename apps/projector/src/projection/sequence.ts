export type ProjectionDecision = 'apply' | 'already-applied' | 'gap';

// Regra de sequência (OQ-43): só aplica o evento da versão current + 1 (current nulo = 0).
export function decideProjection(
  aggregateVersion: number,
  currentVersion: number | null,
): ProjectionDecision {
  const current = currentVersion ?? 0;
  if (aggregateVersion <= current) return 'already-applied';
  if (aggregateVersion === current + 1) return 'apply';
  return 'gap';
}
