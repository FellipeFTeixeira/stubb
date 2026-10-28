import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { describeCommandError } from '@/api/command-errors';
import { ApiError } from '@/api/identity';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  loginFormSchema,
  type LoginFormInput,
  type LoginFormOutput,
} from '@/features/identity/form-schemas';
import { ResendLinkButton } from '@/features/identity/resend-verification';
import { fieldA11y } from '@/features/organizer/field-a11y';
import { FormField } from '@/features/organizer/form-field';
import { safeRedirect } from '@/features/session/route-guards';
import { useSession } from '@/features/session/session-provider';

type LoginFailure =
  | { kind: 'credentials' }
  | { kind: 'unverified'; email: string }
  | { kind: 'other'; message: string };

function describeFailure(error: unknown, email: string): LoginFailure {
  if (error instanceof ApiError) {
    if (error.status === 401) return { kind: 'credentials' };
    if (error.status === 403 && error.code === 'EMAIL_NOT_VERIFIED') {
      return { kind: 'unverified', email };
    }
  }
  return { kind: 'other', message: describeCommandError(error) };
}

export function LoginPage() {
  const idPrefix = useId();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn } = useSession();
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormInput, unknown, LoginFormOutput>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });
  const { mutate, isPending } = useMutation({ mutationFn: signIn });

  const submit = handleSubmit((values) => {
    setFailure(null);
    mutate(values, {
      onSuccess: () => {
        void navigate(safeRedirect(searchParams.get('redirect')), { replace: true });
      },
      onError: (error) => setFailure(describeFailure(error, values.email)),
    });
  });

  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
        {failure?.kind === 'credentials' && (
          <Alert variant="destructive">E-mail ou senha inválidos</Alert>
        )}
        {failure?.kind === 'other' && <Alert variant="destructive">{failure.message}</Alert>}
        {failure?.kind === 'unverified' && (
          <Alert variant="destructive">Confirme seu e-mail antes de entrar</Alert>
        )}
        <FieldGroup>
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
              autoComplete="current-password"
              {...register('password')}
            />
          </FormField>
        </FieldGroup>
        <div>
          <Button type="submit" disabled={isPending}>
            Entrar
          </Button>
        </div>
      </form>
      {failure?.kind === 'unverified' && <ResendLinkButton email={failure.email} />}
      <p className="text-sm text-muted-foreground">
        Ainda não tem conta?{' '}
        <Link to="/cadastro" className="underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
