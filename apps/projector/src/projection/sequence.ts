export type ProjectionDecision = 'apply' | 'already-applied' | 'gap';

// Regra de sequência (OQ-43): só aplica o evento da versão current + 1.
export function decideProjection(
  eventType: string,
  aggregateVersion: number,
  currentVersion: number | null,
): ProjectionDecision {
  const current = currentVersion ?? 0;
  if (aggregateVersion <= current) return 'already-applied';
  if (eventType === 'PingIncremented' && currentVersion === null) return 'gap';
  if (aggregateVersion > current + 1) return 'gap';
  return 'apply';
}
