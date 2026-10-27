import type { CommandAccepted } from '@stubb/contracts';
import { useState } from 'react';
import { describeCommandError } from '@/api/command-errors';
import { Button } from '@/components/ui/button';
import { useCommand } from './use-command';

type Props<V, R extends CommandAccepted> = {
  label: string;
  variables: V;
  send: (variables: V, idempotencyKey: string) => Promise<R>;
  onAccepted: (result: R) => void;
  variant?: 'default' | 'outline' | 'destructive';
};

// Botão de um command sem formulário (publicar, remover): o erro aparece logo abaixo.
export function CommandButton<V, R extends CommandAccepted>({
  label,
  variables,
  send,
  onAccepted,
  variant = 'outline',
}: Props<V, R>) {
  const [error, setError] = useState<string | null>(null);
  const { run, isPending } = useCommand(send);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        size="sm"
        disabled={isPending}
        onClick={() => {
          setError(null);
          run(variables, {
            onSuccess: onAccepted,
            onError: (e) => setError(describeCommandError(e)),
          });
        }}
      >
        {label}
      </Button>
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
