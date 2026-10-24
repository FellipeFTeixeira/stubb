import type { CommandAccepted } from '@stubb/contracts';
import { nowMs } from '@/lib/clock';
import { Button } from '@/components/ui/button';
import { useIncrementPing } from './use-increment-ping';

type Props = {
  pingId: string | null;
  onIncremented: (result: CommandAccepted, startedAt: number) => void;
  onError: (error: unknown) => void;
};

export function IncrementButton({ pingId, onIncremented, onError }: Props) {
  const { mutate, isPending } = useIncrementPing();

  return (
    <Button
      type="button"
      data-testid="increment-ping"
      disabled={pingId === null || isPending}
      onClick={() => {
        if (pingId === null) return;
        const startedAt = nowMs();
        mutate(
          { id: pingId, idempotencyKey: crypto.randomUUID() },
          { onSuccess: (result) => onIncremented(result, startedAt), onError },
        );
      }}
    >
      Incrementar
    </Button>
  );
}
