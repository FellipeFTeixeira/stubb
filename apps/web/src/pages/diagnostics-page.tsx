import { useCallback, useState } from 'react';
import { describeCommandError } from '@/api/diagnostics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreatePingForm } from '@/features/diagnostics/create-ping-form';
import { IncrementButton } from '@/features/diagnostics/increment-button';
import { LatencyHistory } from '@/features/diagnostics/latency-history';
import { PingPanel, type PendingProjection } from '@/features/diagnostics/ping-panel';
import { useDiagnosticsStore } from '@/stores/diagnostics-store';

export function DiagnosticsPage() {
  const selectedPingId = useDiagnosticsStore((state) => state.selectedPingId);
  const selectPing = useDiagnosticsStore((state) => state.selectPing);
  // Estado transitório de UI (aguardando a projeção): local, nunca no Zustand.
  const [pending, setPending] = useState<PendingProjection | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);

  const onSynced = useCallback(() => setPending(null), []);
  const onError = useCallback((error: unknown) => setCommandError(describeCommandError(error)), []);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Diagnóstico do Stubb</h1>
      <Card>
        <CardHeader>
          <CardTitle>Criar ping</CardTitle>
        </CardHeader>
        <CardContent>
          <CreatePingForm
            onError={onError}
            onCreated={(result, startedAt) => {
              setCommandError(null);
              selectPing(result.id);
              setPending({
                pingId: result.id,
                minVersion: result.version,
                action: 'create',
                startedAt,
              });
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ping selecionado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PingPanel
            pingId={selectedPingId}
            pending={pending}
            onSynced={onSynced}
            commandError={commandError}
          />
          <div>
            <IncrementButton
              pingId={selectedPingId}
              onError={onError}
              onIncremented={(result, startedAt) => {
                setCommandError(null);
                setPending({
                  pingId: result.id,
                  minVersion: result.version,
                  action: 'increment',
                  startedAt,
                });
              }}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Histórico de latências</CardTitle>
        </CardHeader>
        <CardContent>
          <LatencyHistory />
        </CardContent>
      </Card>
    </main>
  );
}
