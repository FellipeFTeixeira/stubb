import { zodResolver } from '@hookform/resolvers/zod';
import {
  BRAZIL_STATES,
  BRAZIL_TIME_ZONES,
  DEFAULT_TIME_ZONE,
  type CommandAccepted,
  type RegisterVenueRequest,
} from '@stubb/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { fieldA11y } from './field-a11y';
import { FormField } from './form-field';
import { applyCommandError } from './form-errors';
import { venueFormSchema, type VenueFormInput, type VenueFormOutput } from './form-schemas';
import { isConflict } from './is-conflict';
import { useCommand } from './use-command';

type Props = {
  idPrefix: string;
  submitLabel: string;
  defaultValues?: VenueFormInput;
  // Quem usa decide qual command é (cadastrar ou editar) e com que versão esperada.
  send: (body: RegisterVenueRequest, idempotencyKey: string) => Promise<CommandAccepted>;
  onAccepted: (result: CommandAccepted) => void;
  onConflict?: () => void;
};

const EMPTY: VenueFormInput = {
  name: '',
  address: '',
  city: '',
  state: '',
  timeZone: DEFAULT_TIME_ZONE,
};

const FIELDS = ['name', 'address', 'city', 'state', 'timeZone'] as const;

export function VenueDetailsForm({
  idPrefix,
  submitLabel,
  defaultValues = EMPTY,
  send,
  onAccepted,
  onConflict,
}: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<VenueFormInput, unknown, VenueFormOutput>({
    resolver: zodResolver(venueFormSchema),
    defaultValues,
  });
  const { run, isPending } = useCommand(send);

  const submit = handleSubmit((body) => {
    setFormError(null);
    run(body, {
      onSuccess: onAccepted,
      onError: (error) => {
        if (isConflict(error) && onConflict) return onConflict();
        setFormError(applyCommandError(error, setError, { fields: FIELDS }));
      },
    });
  });

  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="destructive">{formError}</Alert>}
      <FieldGroup>
        <FormField id={id('name')} label="Nome do local" error={errors.name?.message}>
          <Input
            {...fieldA11y(id('name'), errors.name?.message)}
            autoComplete="off"
            {...register('name')}
          />
        </FormField>
        <FormField id={id('address')} label="Endereço" error={errors.address?.message}>
          <Input
            {...fieldA11y(id('address'), errors.address?.message)}
            autoComplete="off"
            {...register('address')}
          />
        </FormField>
        <FormField id={id('city')} label="Cidade" error={errors.city?.message}>
          <Input
            {...fieldA11y(id('city'), errors.city?.message)}
            autoComplete="off"
            {...register('city')}
          />
        </FormField>
        <FormField id={id('state')} label="UF" error={errors.state?.message}>
          <NativeSelect {...fieldA11y(id('state'), errors.state?.message)} {...register('state')}>
            <NativeSelectOption value="">Escolha</NativeSelectOption>
            {BRAZIL_STATES.map((uf) => (
              <NativeSelectOption key={uf} value={uf}>
                {uf}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id={id('timeZone')} label="Fuso horário" error={errors.timeZone?.message}>
          <NativeSelect
            {...fieldA11y(id('timeZone'), errors.timeZone?.message)}
            {...register('timeZone')}
          >
            {BRAZIL_TIME_ZONES.map((zone) => (
              <NativeSelectOption key={zone} value={zone}>
                {zone}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
      </FieldGroup>
      <div>
        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
