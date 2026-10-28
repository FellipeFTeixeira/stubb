import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { resendVerification } from '@/api/identity';
import { describeCommandError } from '@/api/command-errors';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldA11y } from '@/features/organizer/field-a11y';
import { FormField } from '@/features/organizer/form-field';
import { RESEND_DONE } from './format';
import { resendFormSchema, type ResendFormInput, type ResendFormOutput } from './form-schemas';

function useResend() {
  const { mutate, isPending, isSuccess, error } = useMutation({
    mutationFn: resendVerification,
  });
  return { send: mutate, isPending, isSuccess, error };
}

function ResendFeedback({ isSuccess, error }: { isSuccess: boolean; error: unknown }) {
  if (error !== null && error !== undefined) {
    return <Alert variant="destructive">{describeCommandError(error)}</Alert>;
  }
  if (isSuccess) return <p role="status">{RESEND_DONE}</p>;
  return null;
}

// Reenvio quando já sabemos o e-mail (acabou de cadastrar ou de tentar entrar).
export function ResendLinkButton({ email }: { email: string }) {
  const { send, isPending, isSuccess, error } = useResend();
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => send(email)}>
          Reenviar link
        </Button>
      </div>
      <ResendFeedback isSuccess={isSuccess} error={error} />
    </div>
  );
}

// Reenvio quando o link falhou e o e-mail precisa ser digitado.
export function ResendVerificationForm({ idPrefix }: { idPrefix: string }) {
  const { send, isPending, isSuccess, error } = useResend();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResendFormInput, unknown, ResendFormOutput>({
    resolver: zodResolver(resendFormSchema),
    defaultValues: { email: '' },
  });
  const id = `${idPrefix}-email`;
  return (
    <form
      onSubmit={(event) => void handleSubmit((values) => send(values.email))(event)}
      noValidate
      className="flex flex-col gap-4"
    >
      <FormField id={id} label="E-mail" error={errors.email?.message}>
        <Input
          {...fieldA11y(id, errors.email?.message)}
          type="email"
          autoComplete="email"
          {...register('email')}
        />
      </FormField>
      <div>
        <Button type="submit" disabled={isPending}>
          Reenviar link
        </Button>
      </div>
      <ResendFeedback isSuccess={isSuccess} error={error} />
    </form>
  );
}
