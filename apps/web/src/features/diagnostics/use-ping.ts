import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getPing } from '@/api/diagnostics';

export const POLL_INTERVAL_MS = 250;

export function usePing(id: string | null, minVersion?: number) {
  return useQuery({
    queryKey: ['diagnostics', 'ping', id, minVersion ?? null],
    queryFn: () => getPing({ id: id as string, minVersion }),
    enabled: id !== null,
    // Mantém o último dado ao trocar de min_version, para a tela não piscar.
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data === undefined || minVersion === undefined) return false;
      if (data.status === 'not-found') return POLL_INTERVAL_MS;
      return data.minVersionReached ? false : POLL_INTERVAL_MS;
    },
    retry: false,
  });
}
