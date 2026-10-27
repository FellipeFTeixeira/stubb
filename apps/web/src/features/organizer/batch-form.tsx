import { zodResolver } from '@hookform/resolvers/zod';
import type { AddBatchRequest, CommandAccepted } from '@stubb/contracts';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { fieldA11y } from './field-a11y';
import { FormField } from './form-field';
import { applyCommandError } from './form-errors';
import { batchFormSchema, type BatchFormInput, type BatchFormOutput } from './form-schemas';
import { useCommand } from './use-command';

type Props = {
  idPrefix: string;
  // Fuso da sessão: o "Fim do lote" é digitado nele.
  timeZone: string;
  send: (body: AddBatchRequest, idempotencyKey: string) => Promise<CommandAccepted>;
  onAccepted: (result: CommandAccepted) => void;
};

const EMPTY: BatchFormInput = { name: '', price: '', quantity: '', endsAt: '' };
const FIELDS = ['name', 'price', 'quantity', 'endsAt'] as const;

export function BatchForm({ idPrefix, timeZone, send, onAccepted }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const schema = useMemo(() => batchFormSchema(timeZone), [timeZone]);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<BatchFormInput, unknown, BatchFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const { run, isPending } = useCommand(send);

  const submit = handleSubmit(({ name, price, quantity, endsAt }) => {
    setFormError(null);
    run(
      { name, priceCents: price, quantity, endsAt },
      {
        onSuccess: (result) => {
          reset(EMPTY);
          onAccepted(result);
        },
        // O corpo chama o preço de `priceCents`; o campo da tela é `price`.
        onError: (error) =>
          setFormError(
            applyCommandError(error, setError, { fields: FIELDS, alias: { priceCents: 'price' } }),
          ),
      },
    );
  });

  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-3">
      {formError && <Alert variant="destructive">{formError}</Alert>}
      <FieldGroup>
        <FormField id={id('name')} label="Nome do lote" error={errors.name?.message}>
          <Input
            {...fieldA11y(id('name'), errors.name?.message)}
            autoComplete="off"
            {...register('name')}
          />
        </FormField>
        <FormField id={id('price')} label="Preço" error={errors.price?.message}>
          <Input
            {...fieldA11y(id('price'), errors.price?.message)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="80,00"
            {...register('price')}
          />
        </FormField>
        <FormField
          id={id('quantity')}
          label="Quantidade (opcional)"
          error={errors.quantity?.message}
        >
          <Input
            {...fieldA11y(id('quantity'), errors.quantity?.message)}
            inputMode="numeric"
            autoComplete="off"
            {...register('quantity')}
          />
        </FormField>
        <FormField id={id('endsAt')} label="Fim do lote (opcional)" error={errors.endsAt?.message}>
          <Input
            {...fieldA11y(id('endsAt'), errors.endsAt?.message)}
            type="datetime-local"
            {...register('endsAt')}
          />
        </FormField>
      </FieldGroup>
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          Adicionar lote
        </Button>
      </div>
    </form>
  );
}
