import { zodResolver } from '@hookform/resolvers/zod';
import type { CommandAccepted, ScheduleSessionRequest, VenueSummary } from '@stubb/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { ApiError } from '@/api/http';
import { catalogKeys } from '@/api/query-keys';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { fieldA11y } from './field-a11y';
import { FormField } from './form-field';
import { applyCommandError } from './form-errors';
import {
  scheduleFormSchema,
  type ScheduleFormInput,
  type ScheduleFormOutput,
} from './form-schemas';
import { useCommand } from './use-command';

type Props = {
  idPrefix: string;
  venues: readonly VenueSummary[];
  send: (body: ScheduleSessionRequest, idempotencyKey: string) => Promise<CommandAccepted>;
  onAccepted: (result: CommandAccepted) => void;
};

const EMPTY: ScheduleFormInput = { venueId: '', startsAt: '', salesStartsAt: '' };
const FIELDS = ['venueId', 'startsAt', 'salesStartsAt'] as const;

export function ScheduleSessionForm({ idPrefix, venues, send, onAccepted }: Props) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const schema = useMemo(
    () => scheduleFormSchema((venueId) => venues.find((v) => v.id === venueId)?.timeZone),
    [venues],
  );
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ScheduleFormInput, unknown, ScheduleFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const venueId = useWatch({ control, name: 'venueId' });
  const timeZone = venues.find((v) => v.id === venueId)?.timeZone;
  const { run, isPending } = useCommand(send);

  const submit = handleSubmit((body) => {
    setFormError(null);
    run(body, {
      onSuccess: (result) => {
        reset(EMPTY);
        onAccepted(result);
      },
      onError: (error) => {
        // O fuso do local mudou desde que a lista foi lida: recarrega para o próximo envio.
        if (error instanceof ApiError && error.code === 'VENUE_TIME_ZONE_CHANGED') {
          void queryClient.invalidateQueries({ queryKey: catalogKeys.organizerVenues });
          void queryClient.invalidateQueries({
            queryKey: catalogKeys.organizerVenue(body.venueId),
          });
        }
        setFormError(applyCommandError(error, setError, { fields: FIELDS }));
      },
    });
  });

  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="destructive">{formError}</Alert>}
      {venues.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Você ainda não tem locais.{' '}
          <Link to="/produtor/locais/novo" className="underline">
            Cadastre um local
          </Link>{' '}
          com setores para agendar uma sessão.
        </p>
      )}
      <FieldGroup>
        <FormField id={id('venueId')} label="Local" error={errors.venueId?.message}>
          <NativeSelect
            {...fieldA11y(id('venueId'), errors.venueId?.message)}
            {...register('venueId')}
          >
            <NativeSelectOption value="">Escolha</NativeSelectOption>
            {venues.map((venue) => (
              <NativeSelectOption key={venue.id} value={venue.id}>
                {`${venue.name} — ${venue.city}/${venue.state}`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        {timeZone && <p className="text-sm text-muted-foreground">Horários no fuso {timeZone}.</p>}
        <FormField id={id('startsAt')} label="Início da sessão" error={errors.startsAt?.message}>
          <Input
            {...fieldA11y(id('startsAt'), errors.startsAt?.message)}
            type="datetime-local"
            {...register('startsAt')}
          />
        </FormField>
        <FormField
          id={id('salesStartsAt')}
          label="Início das vendas"
          error={errors.salesStartsAt?.message}
        >
          <Input
            {...fieldA11y(id('salesStartsAt'), errors.salesStartsAt?.message)}
            type="datetime-local"
            {...register('salesStartsAt')}
          />
        </FormField>
      </FieldGroup>
      <div>
        <Button type="submit" disabled={isPending}>
          Agendar sessão
        </Button>
      </div>
    </form>
  );
}
