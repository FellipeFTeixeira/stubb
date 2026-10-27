import { zodResolver } from '@hookform/resolvers/zod';
import type { AddSessionSectorRequest, CommandAccepted } from '@stubb/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { fieldA11y } from './field-a11y';
import { FormField } from './form-field';
import { applyCommandError } from './form-errors';
import { sessionSectorFormSchema, type SessionSectorFormInput } from './form-schemas';
import { useCommand } from './use-command';

type Props = {
  idPrefix: string;
  // Setores da planta atual do local que ainda não estão na sessão.
  options: ReadonlyArray<{ id: string; name: string }>;
  send: (body: AddSessionSectorRequest, idempotencyKey: string) => Promise<CommandAccepted>;
  onAccepted: (result: CommandAccepted) => void;
};

export function SessionSectorAddForm({ idPrefix, options, send, onAccepted }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<SessionSectorFormInput, unknown, AddSessionSectorRequest>({
    resolver: zodResolver(sessionSectorFormSchema),
    defaultValues: { venueSectorId: '' },
  });
  const { run, isPending } = useCommand(send);

  const submit = handleSubmit((body) => {
    setFormError(null);
    run(body, {
      onSuccess: (result) => {
        reset({ venueSectorId: '' });
        onAccepted(result);
      },
      onError: (error) =>
        setFormError(applyCommandError(error, setError, { fields: ['venueSectorId'] })),
    });
  });

  const id = `${idPrefix}-venueSectorId`;
  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex flex-wrap items-end gap-3"
    >
      {formError && (
        <Alert variant="destructive" className="w-full">
          {formError}
        </Alert>
      )}
      <FormField id={id} label="Setor da planta" error={errors.venueSectorId?.message}>
        <NativeSelect
          {...fieldA11y(id, errors.venueSectorId?.message)}
          {...register('venueSectorId')}
        >
          <NativeSelectOption value="">Escolha</NativeSelectOption>
          {options.map((option) => (
            <NativeSelectOption key={option.id} value={option.id}>
              {option.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FormField>
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        Adicionar setor à sessão
      </Button>
    </form>
  );
}
