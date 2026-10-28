import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { describeCommandError } from '@/api/command-errors';
import { ApiError, registerUser } from '@/api/identity';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  registerFormSchema,
  type RegisterFormInput,
  type RegisterFormOutput,
} from '@/features/identity/form-schemas';
import { ResendLinkButton } from '@/features/identity/resend-verification';
import { useIdentityCommand } from '@/features/identity/use-identity-command';
import { fieldA11y } from '@/features/organizer/field-a11y';
import { applyCommandError } from '@/features/organizer/form-errors';
import { FormField } from '@/features/organizer/form-field';

const FIELDS = ['fullName', 'email', 'password', 'cpf'] as const;

export function RegisterPage() {
  const idPrefix = useId();
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterFormInput, unknown, RegisterFormOutput>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { fullName: '', email: '', password: '', cpf: '' },
  });
  // A mesma Idempotency-Key vale enquanto o corpo não muda (duplo clique, retry de rede).
  const { run, isPending } = useIdentityCommand(registerUser);

  const submit = handleSubmit((values) => {
    setFormError(null);
    run(values, {
      onSuccess: () => setRegisteredEmail(values.email),
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) {
          const field =
            error.code === 'EMAIL_ALREADY_REGISTERED'
              ? 'email'
              : error.code === 'CPF_ALREADY_REGISTERED'
                ? 'cpf'
                : null;
          if (field !== null) {
            setError(
              field,
              { type: 'server', message: describeCommandError(error) },
              { shouldFocus: true },
            );
            return;
          }
        }
        setFormError(applyCommandError(error, setError, { fields: FIELDS }));
      },
    });
  });

  if (registeredEmail !== null) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="text-2xl font-semibold">Confira seu e-mail</h1>
        <p>
          Enviamos um link para <strong>{registeredEmail}</strong>. Abra o e-mail para ativar a
          conta.
        </p>
        <ResendLinkButton email={registeredEmail} />
        <p className="text-sm text-muted-foreground">
          Já ativou a conta?{' '}
          <Link to="/entrar" className="underline">
            Entrar
          </Link>
        </p>
      </div>
    );
  }

  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Criar conta</h1>
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
        {formError && <Alert variant="destructive">{formError}</Alert>}
        <FieldGroup>
          <FormField id={id('fullName')} label="Nome completo" error={errors.fullName?.message}>
            <Input
              {...fieldA11y(id('fullName'), errors.fullName?.message)}
              autoComplete="name"
              {...register('fullName')}
            />
          </FormField>
          <FormField id={id('email')} label="E-mail" error={errors.email?.message}>
            <Input
              {...fieldA11y(id('email'), errors.email?.message)}
              type="email"
              autoComplete="email"
              {...register('email')}
            />
          </FormField>
          <FormField id={id('password')} label="Senha" error={errors.password?.message}>
            <Input
              {...fieldA11y(id('password'), errors.password?.message)}
              type="password"
              autoComplete="new-password"
              {...register('password')}
            />
          </FormField>
          <FormField id={id('cpf')} label="CPF" error={errors.cpf?.message}>
            <Input
              {...fieldA11y(id('cpf'), errors.cpf?.message)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              {...register('cpf')}
            />
          </FormField>
        </FieldGroup>
        <div>
          <Button type="submit" disabled={isPending}>
            Criar conta
          </Button>
        </div>
      </form>
      <p className="text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link to="/entrar" className="underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
