import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { nowMs } from '@/lib/clock';
import { usePing } from './use-ping';
import { useDiagnosticsStore } from '@/stores/diagnostics-store';

export type PendingProjection = {
  pingId: string;
  minVersion: number;
  action: 'create' | 'increment';
  startedAt: number;
};

type Props = {
  pingId: string | null;
  pending: PendingProjection | null;
  onSynced: () => void;
  commandError: string | null;
};

export function PingPanel({ pingId, pending, onSynced, commandError }: Props) {
  const queryClient = useQueryClient();
  const recordLatency = useDiagnosticsStore((state) => state.recordLatency);
  const activePending = pending !== null && pending.pingId === pingId ? pending : null;
  const { data, isPlaceholderData } = usePing(pingId, activePending?.minVersion);

  const reached =
    activePending !== null &&
    data?.status === 'found' &&
    data.minVersionReached &&
    !isPlaceholderData;

  useEffect(() => {
    if (!reached || activePending === null || data?.status !== 'found') return;
    recordLatency({
      pingId: activePending.pingId,
      action: activePending.action,
      version: data.ping.version,
      latencyMs: nowMs() - activePending.startedAt,
      measuredAt: new Date().toISOString(),
    });
    // Semeia o cache sem min_version para a tela não voltar a um dado antigo ao terminar a espera.
    queryClient.setQueryData(['diagnostics', 'ping', activePending.pingId, null], data);
    onSynced();
  }, [reached, activePending, data, recordLatency, onSynced, queryClient]);

  const ping = data?.status === 'found' ? data.ping : null;
  const synced = activePending === null;

  return (
    <div className="flex flex-col gap-2">
      {pingId === null ? (
        <p className="text-sm text-muted-foreground">Nenhum ping selecionado.</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Rótulo</dt>
          <dd data-testid="ping-label">{ping?.label ?? '—'}</dd>
          <dt className="text-muted-foreground">Contagem</dt>
          <dd data-testid="ping-count">{ping?.count ?? '—'}</dd>
          <dt className="text-muted-foreground">Versão</dt>
          <dd data-testid="ping-version">{ping?.version ?? '—'}</dd>
          <dt className="text-muted-foreground">Situação</dt>
          <dd data-testid="ping-sync-status">{synced ? 'sincronizado' : 'aguardando projeção'}</dd>
        </dl>
      )}
      {commandError !== null && (
        <p role="alert" data-testid="command-error" className="text-sm text-destructive">
          {commandError}
        </p>
      )}
    </div>
  );
}
