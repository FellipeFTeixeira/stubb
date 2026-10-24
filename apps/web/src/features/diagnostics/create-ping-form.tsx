import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreatePingRequestSchema,
  type CommandAccepted,
  type CreatePingRequest,
  type CreatePingRequestInput,
} from '@stubb/contracts';
import { useForm } from 'react-hook-form';
import { nowMs } from '@/lib/clock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreatePing } from './use-create-ping';

type Props = {
  onCreated: (result: CommandAccepted, startedAt: number) => void;
  onError: (error: unknown) => void;
};

export function CreatePingForm({ onCreated, onError }: Props) {
  const { mutate, isPending } = useCreatePing();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreatePingRequestInput, unknown, CreatePingRequest>({
    resolver: zodResolver(CreatePingRequestSchema),
    defaultValues: { label: '' },
  });

  const submit = handleSubmit(({ label }) => {
    const startedAt = nowMs();
    // Uma chave nova por ação do usuário; os retries da mutation reusam esta.
    mutate(
      { label, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: (result) => {
          reset();
          onCreated(result, startedAt);
        },
        onError,
      },
    );
  });

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2" noValidate>
      <Label htmlFor="create-ping-label">Rótulo do ping</Label>
      <div className="flex gap-2">
        <Input
          id="create-ping-label"
          data-testid="create-ping-label-input"
          autoComplete="off"
          {...register('label')}
        />
        <Button type="submit" data-testid="create-ping-submit" disabled={isPending}>
          Criar ping
        </Button>
      </div>
      {errors.label && (
        <p role="alert" data-testid="create-ping-label-error" className="text-sm text-destructive">
          {errors.label.message}
        </p>
      )}
    </form>
  );
}
