import { useCallback, useMemo, useRef } from 'react';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// Uma chave por intenção: enquanto o payload não muda, reenviar (retry, duplo clique, erro de
// rede) reusa a mesma chave. Mudou o payload, é outra intenção. `reset()` depois do sucesso.
export function useIdempotencyKey() {
  const current = useRef<{ fingerprint: string; key: string } | null>(null);

  const keyFor = useCallback((payload: unknown): string => {
    const fingerprint = stableStringify(payload);
    if (current.current?.fingerprint !== fingerprint) {
      current.current = { fingerprint, key: crypto.randomUUID() };
    }
    return current.current.key;
  }, []);

  const reset = useCallback(() => {
    current.current = null;
  }, []);

  return useMemo(() => ({ keyFor, reset }), [keyFor, reset]);
}
