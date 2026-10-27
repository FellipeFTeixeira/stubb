import type { CommandAccepted } from '@stubb/contracts';
import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { COMMAND_RETRY_DELAY_MS, shouldRetryCommand } from '@/api/mutation-retry';
import { useIdempotencyKey } from '@/lib/idempotency';

type Handlers<R> = {
  onSuccess?: (result: R) => void;
  onError?: (error: unknown) => void;
};

// Um command por intenção: a Idempotency-Key é a mesma enquanto as variáveis (ids + corpo) não
// mudam, então retry automático, duplo clique e reenvio após erro de rede reusam a chave. Depois
// do sucesso a chave zera e a próxima intenção ganha uma nova.
export function useCommand<V, R extends CommandAccepted>(
  send: (variables: V, idempotencyKey: string) => Promise<R>,
) {
  const { keyFor, reset } = useIdempotencyKey();
  const { mutate, isPending } = useMutation({
    mutationFn: ({ variables, key }: { variables: V; key: string }) => send(variables, key),
    retry: shouldRetryCommand,
    retryDelay: COMMAND_RETRY_DELAY_MS,
  });

  const run = useCallback(
    (variables: V, handlers: Handlers<R> = {}) => {
      mutate(
        { variables, key: keyFor(variables) },
        {
          onSuccess: (result) => {
            reset();
            handlers.onSuccess?.(result);
          },
          onError: handlers.onError,
        },
      );
    },
    [mutate, keyFor, reset],
  );

  return { run, isPending };
}
