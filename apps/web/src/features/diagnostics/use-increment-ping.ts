import { useMutation } from '@tanstack/react-query';
import { incrementPing } from '@/api/diagnostics';
import { COMMAND_RETRY_DELAY_MS, shouldRetryCommand } from '@/api/mutation-retry';

export function useIncrementPing() {
  return useMutation({
    mutationFn: incrementPing,
    retry: shouldRetryCommand,
    retryDelay: COMMAND_RETRY_DELAY_MS,
  });
}
