import { create } from 'zustand';

export type LatencyEntry = {
  pingId: string;
  action: 'create' | 'increment';
  version: number;
  latencyMs: number;
  measuredAt: string;
};

type DiagnosticsState = {
  selectedPingId: string | null;
  latencyHistory: LatencyEntry[];
  selectPing: (id: string) => void;
  recordLatency: (entry: LatencyEntry) => void;
};

// Só estado de cliente: dado do ping vive no cache do TanStack Query (RN-15).
export const useDiagnosticsStore = create<DiagnosticsState>()((set) => ({
  selectedPingId: null,
  latencyHistory: [],
  selectPing: (id) => set({ selectedPingId: id }),
  recordLatency: (entry) => set((state) => ({ latencyHistory: [entry, ...state.latencyHistory] })),
}));
