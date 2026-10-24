import { useDiagnosticsStore } from '@/stores/diagnostics-store';

const ACTION_LABEL = { create: 'Criação', increment: 'Incremento' } as const;

export function LatencyHistory() {
  const history = useDiagnosticsStore((state) => state.latencyHistory);
  const selectedPingId = useDiagnosticsStore((state) => state.selectedPingId);
  const selectPing = useDiagnosticsStore((state) => state.selectPing);

  return (
    <ul data-testid="latency-history" className="flex flex-col gap-1">
      {history.map((entry) => (
        <li key={`${entry.pingId}-${entry.version}-${entry.measuredAt}`}>
          <button
            type="button"
            data-testid="latency-entry"
            data-ping-id={entry.pingId}
            aria-pressed={entry.pingId === selectedPingId}
            onClick={() => selectPing(entry.pingId)}
            className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted aria-pressed:border-primary"
          >
            {ACTION_LABEL[entry.action]} · versão {entry.version} · {Math.round(entry.latencyMs)} ms
          </button>
        </li>
      ))}
    </ul>
  );
}
