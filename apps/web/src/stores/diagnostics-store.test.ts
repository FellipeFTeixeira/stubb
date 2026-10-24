import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagnosticsStore, type LatencyEntry } from './diagnostics-store';

const entry = (version: number): LatencyEntry => ({
  pingId: 'p1',
  action: 'increment',
  version,
  latencyMs: 12,
  measuredAt: '2026-10-24T00:00:00.000Z',
});

describe('useDiagnosticsStore', () => {
  beforeEach(() => {
    useDiagnosticsStore.setState({ selectedPingId: null, latencyHistory: [] });
  });

  it('tem só estado de cliente e as ações que o alteram', () => {
    expect(Object.keys(useDiagnosticsStore.getState()).sort()).toEqual([
      'latencyHistory',
      'recordLatency',
      'selectPing',
      'selectedPingId',
    ]);
  });

  it('selectPing altera selectedPingId', () => {
    useDiagnosticsStore.getState().selectPing('abc');
    expect(useDiagnosticsStore.getState().selectedPingId).toBe('abc');
  });

  it('recordLatency insere no início', () => {
    useDiagnosticsStore.getState().recordLatency(entry(1));
    useDiagnosticsStore.getState().recordLatency(entry(2));
    expect(useDiagnosticsStore.getState().latencyHistory.map((e) => e.version)).toEqual([2, 1]);
  });
});
