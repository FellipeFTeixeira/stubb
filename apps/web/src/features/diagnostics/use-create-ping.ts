import { useMutation } from '@tanstack/react-query';
import { createPing } from '@/api/diagnostics';
import { COMMAND_RETRY_DELAY_MS, shouldRetryCommand } from '@/api/mutation-retry';

export function useCreatePing() {
  return useMutation({
    mutationFn: createPing,
    retry: shouldRetryCommand,
    retryDelay: COMMAND_RETRY_DELAY_MS,
  });
}
