import { getPing } from '@/api/diagnostics';
import { PROJECTION_POLL_INTERVAL_MS, useVersionedQuery } from '@/lib/read-your-writes';

export const POLL_INTERVAL_MS = PROJECTION_POLL_INTERVAL_MS;

// O diagnóstico espera a projeção sem limite (a latência é o que ele mede).
export function usePing(id: string | null, minVersion?: number) {
  const { query } = useVersionedQuery({
    queryKey: ['diagnostics', 'ping', id],
    queryFn: async (version) => {
      const result = await getPing({ id: id as string, minVersion: version });
      return result.status === 'found' ? result : { ...result, minVersionReached: false };
    },
    minVersion,
    budgetMs: Infinity,
    enabled: id !== null,
  });
  return query;
}
