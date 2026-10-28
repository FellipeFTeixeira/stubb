import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { COMMAND_RETRY_DELAY_MS, shouldRetryCommand } from '@/api/mutation-retry';
import { useIdempotencyKey } from '@/lib/idempotency';

type Handlers<R> = {
  onSuccess?: (result: R) => void;
  onError?: (error: unknown) => void;
};

// Igual ao `useCommand` do produtor, mas sem exigir `version` na resposta: a Identity devolve só
// `{ id }`. A Idempotency-Key é a mesma enquanto as variáveis não mudam (retry, duplo clique) e
// zera depois do sucesso.
export function useIdentityCommand<V, R>(
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
