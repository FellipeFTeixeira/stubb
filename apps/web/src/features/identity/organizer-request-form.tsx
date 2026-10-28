import { zodResolver } from '@hookform/resolvers/zod';
import { RequestOrganizerRoleRequestSchema } from '@stubb/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { describeCommandError } from '@/api/command-errors';
import { ApiError, requestOrganizerRole } from '@/api/identity';
import { identityKeys } from '@/api/query-keys';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { fieldA11y } from '@/features/organizer/field-a11y';
import { applyCommandError } from '@/features/organizer/form-errors';
import { FormField } from '@/features/organizer/form-field';
import { useIdentityCommand } from './use-identity-command';

type FormInput = z.input<typeof RequestOrganizerRoleRequestSchema>;
type FormOutput = z.output<typeof RequestOrganizerRoleRequestSchema>;

const FIELDS = ['organizationName', 'cnpj', 'reason'] as const;

export function OrganizerRequestForm() {
  const idPrefix = useId();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(RequestOrganizerRoleRequestSchema),
    defaultValues: { organizationName: '', cnpj: '', reason: '' },
  });
  const { run, isPending } = useIdentityCommand(requestOrganizerRole);

  const refreshAccount = () => {
    void queryClient.invalidateQueries({ queryKey: identityKeys.myOrganizerRequests });
    void queryClient.invalidateQueries({ queryKey: identityKeys.me });
  };

  const submit = handleSubmit((values) => {
    setFormError(null);
    run(values, {
      onSuccess: () => {
        reset();
        refreshAccount();
      },
      onError: (error) => {
        // Pedido pendente ou conta já produtora: a tela está desatualizada, recarrega.
        if (
          error instanceof ApiError &&
          error.status === 409 &&
          (error.code === 'ORGANIZER_REQUEST_PENDING' || error.code === 'ALREADY_ORGANIZER')
        ) {
          setFormError(describeCommandError(error));
          refreshAccount();
          return;
        }
        setFormError(applyCommandError(error, setError, { fields: FIELDS }));
      },
    });
  });

  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="destructive">{formError}</Alert>}
      <FieldGroup>
        <FormField
          id={id('organizationName')}
          label="Nome da organização"
          error={errors.organizationName?.message}
        >
          <Input
            {...fieldA11y(id('organizationName'), errors.organizationName?.message)}
            autoComplete="organization"
            {...register('organizationName')}
          />
        </FormField>
        <FormField id={id('cnpj')} label="CNPJ" error={errors.cnpj?.message}>
          <Input
            {...fieldA11y(id('cnpj'), errors.cnpj?.message)}
            autoComplete="off"
            placeholder="00.000.000/0000-00"
            {...register('cnpj')}
          />
        </FormField>
        <FormField id={id('reason')} label="Motivo" error={errors.reason?.message}>
          <Textarea
            {...fieldA11y(id('reason'), errors.reason?.message)}
            rows={4}
            {...register('reason')}
          />
        </FormField>
      </FieldGroup>
      <div>
        <Button type="submit" disabled={isPending}>
          Enviar pedido
        </Button>
      </div>
    </form>
  );
}
