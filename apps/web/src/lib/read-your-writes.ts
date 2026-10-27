import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

export const PROJECTION_WAIT_BUDGET_MS = 10_000;
export const PROJECTION_POLL_INTERVAL_MS = 250;

export type ProjectionWaitStatus = 'idle' | 'waiting' | 'synced' | 'timed-out';

type Options<T> = {
  queryKey: readonly unknown[];
  queryFn: (minVersion: number | undefined) => Promise<T>;
  minVersion?: number;
  budgetMs?: number;
  enabled?: boolean;
};

// Read-your-writes: o command devolveu uma versão; a leitura repete (polling) até o read model
// alcançar essa versão ou o limite de espera estourar. O limite é do web: o servidor só espera 3 s.
export function useVersionedQuery<T extends { minVersionReached: boolean }>({
  queryKey,
  queryFn,
  minVersion,
  budgetMs = PROJECTION_WAIT_BUDGET_MS,
  enabled = true,
}: Options<T>): {
  query: UseQueryResult<T>;
  status: ProjectionWaitStatus;
  restart: () => void;
} {
  const queryClient = useQueryClient();
  const [epoch, setEpoch] = useState(0);
  const [expiredToken, setExpiredToken] = useState<string | null>(null);
  // Cada (versão esperada, tentativa) tem o seu limite; trocar um deles zera a contagem.
  const token = `${minVersion ?? 'none'}:${epoch}`;
  const timedOut = expiredToken === token;

  const query = useQuery({
    queryKey: [...queryKey, minVersion ?? null],
    queryFn: () => queryFn(minVersion),
    enabled,
    // Mantém o último dado ao trocar de min_version, para a tela não piscar.
    placeholderData: keepPreviousData,
    retry: false,
    refetchInterval: (q) => {
      if (minVersion === undefined || timedOut) return false;
      const data = q.state.data;
      if (data === undefined) return false;
      return data.minVersionReached ? false : PROJECTION_POLL_INTERVAL_MS;
    },
  });

  const data = query.data;
  const synced =
    minVersion !== undefined &&
    data !== undefined &&
    !query.isPlaceholderData &&
    data.minVersionReached;

  useEffect(() => {
    if (!enabled || minVersion === undefined || synced || !Number.isFinite(budgetMs)) return;
    const timer = setTimeout(() => setExpiredToken(token), budgetMs);
    return () => clearTimeout(timer);
  }, [enabled, minVersion, synced, budgetMs, token]);

  useEffect(() => {
    if (!synced) return;
    // Semeia a chave sem min_version para a tela não voltar a um dado antigo ao terminar a espera.
    const seedKey = [...queryKey, null];
    if (queryClient.getQueryData(seedKey) !== data) queryClient.setQueryData(seedKey, data);
  }, [synced, data, queryKey, queryClient]);

  const { refetch } = query;
  const restart = useCallback(() => {
    setEpoch((value) => value + 1);
    void refetch();
  }, [refetch]);

  let status: ProjectionWaitStatus = 'waiting';
  if (minVersion === undefined) status = 'idle';
  else if (synced) status = 'synced';
  else if (timedOut) status = 'timed-out';

  return { query, status, restart };
}
