import { zodResolver } from '@hookform/resolvers/zod';
import { SECTOR_KINDS, type AddVenueSectorRequest, type CommandAccepted } from '@stubb/contracts';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SECTOR_KIND_LABELS } from '@/lib/catalog-labels';
import { fieldA11y } from './field-a11y';
import { FormField } from './form-field';
import { applyCommandError } from './form-errors';
import { sectorFormSchema, type SectorFormInput, type SectorFormOutput } from './form-schemas';
import { useCommand } from './use-command';

type Props = {
  idPrefix: string;
  send: (body: AddVenueSectorRequest, idempotencyKey: string) => Promise<CommandAccepted>;
  onAccepted: (result: CommandAccepted) => void;
};

const EMPTY: SectorFormInput = {
  name: '',
  kind: 'general_admission',
  capacity: '',
  rows: [{ label: '', seats: '' }],
};

const FIELDS = ['name', 'kind', 'capacity', 'rows'] as const;

export function VenueSectorForm({ idPrefix, send, onAccepted }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<SectorFormInput, unknown, SectorFormOutput>({
    resolver: zodResolver(sectorFormSchema),
    defaultValues: EMPTY,
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'rows' });
  const kind = useWatch({ control, name: 'kind' });
  const { run, isPending } = useCommand(send);

  const submit = handleSubmit((body) => {
    setFormError(null);
    run(body, {
      onSuccess: (result) => {
        reset(EMPTY);
        onAccepted(result);
      },
      onError: (error) => setFormError(applyCommandError(error, setError, { fields: FIELDS })),
    });
  });

  const id = (name: string) => `${idPrefix}-${name}`;
  const rowsError = errors.rows?.root?.message ?? errors.rows?.message;
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="destructive">{formError}</Alert>}
      <FieldGroup>
        <FormField id={id('name')} label="Nome do setor" error={errors.name?.message}>
          <Input
            {...fieldA11y(id('name'), errors.name?.message)}
            autoComplete="off"
            {...register('name')}
          />
        </FormField>
        <FormField id={id('kind')} label="Tipo" error={errors.kind?.message}>
          <NativeSelect {...fieldA11y(id('kind'), errors.kind?.message)} {...register('kind')}>
            {SECTOR_KINDS.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {SECTOR_KIND_LABELS[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        {kind === 'general_admission' && (
          <FormField id={id('capacity')} label="Capacidade" error={errors.capacity?.message}>
            <Input
              {...fieldA11y(id('capacity'), errors.capacity?.message)}
              inputMode="numeric"
              autoComplete="off"
              {...register('capacity')}
            />
          </FormField>
        )}
        {kind === 'seated' && (
          <div className="flex flex-col gap-3">
            {fields.map((field, index) => {
              const n = index + 1;
              const labelError = errors.rows?.[index]?.label?.message;
              const seatsError = errors.rows?.[index]?.seats?.message;
              return (
                <div key={field.id} className="flex flex-wrap items-start gap-3">
                  <FormField
                    id={id(`row-${n}-label`)}
                    label={`Rótulo da fila ${n}`}
                    error={labelError}
                  >
                    <Input
                      {...fieldA11y(id(`row-${n}-label`), labelError)}
                      autoComplete="off"
                      {...register(`rows.${index}.label`)}
                    />
                  </FormField>
                  <FormField
                    id={id(`row-${n}-seats`)}
                    label={`Assentos da fila ${n}`}
                    error={seatsError}
                  >
                    <Input
                      {...fieldA11y(id(`row-${n}-seats`), seatsError)}
                      inputMode="numeric"
                      autoComplete="off"
                      {...register(`rows.${index}.seats`)}
                    />
                  </FormField>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-6"
                    onClick={() => remove(index)}
                  >
                    {`Remover fila ${n}`}
                  </Button>
                </div>
              );
            })}
            {rowsError && (
              <p role="alert" className="text-sm text-destructive">
                {rowsError}
              </p>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ label: '', seats: '' })}
              >
                Adicionar fila
              </Button>
            </div>
          </div>
        )}
      </FieldGroup>
      <div>
        <Button type="submit" disabled={isPending}>
          Adicionar setor
        </Button>
      </div>
    </form>
  );
}
