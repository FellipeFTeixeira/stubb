import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiError, confirmEmail } from '@/api/identity';
import { describeCommandError } from '@/api/command-errors';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { ResendVerificationForm } from '@/features/identity/resend-verification';

function InvalidLink({ idPrefix }: { idPrefix: string }) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Link inválido ou vencido</h1>
      <p>Informe seu e-mail para receber um novo link de confirmação.</p>
      <ResendVerificationForm idPrefix={idPrefix} />
    </>
  );
}

export function VerifyEmailPage() {
  const idPrefix = useId();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { mutate, isSuccess, isError, error } = useMutation({ mutationFn: confirmEmail });
  // O StrictMode roda o efeito duas vezes; o token é de uso único e a confirmação só pode sair uma vez.
  const started = useRef(false);

  useEffect(() => {
    if (token === null || token === '' || started.current) return;
    started.current = true;
    mutate(token);
  }, [token, mutate]);

  let content;
  if (token === null || token === '') {
    content = <InvalidLink idPrefix={idPrefix} />;
  } else if (isSuccess) {
    content = (
      <>
        <h1 className="text-2xl font-semibold">E-mail confirmado</h1>
        <p>Sua conta está ativa.</p>
        <Link to="/entrar" className="underline">
          Entrar
        </Link>
      </>
    );
  } else if (isError && error instanceof ApiError && error.code === 'VERIFICATION_TOKEN_INVALID') {
    content = <InvalidLink idPrefix={idPrefix} />;
  } else if (isError) {
    content = (
      <>
        <h1 className="text-2xl font-semibold">Não foi possível confirmar</h1>
        <Alert variant="destructive">{describeCommandError(error)}</Alert>
      </>
    );
  } else {
    content = (
      <>
        <h1 className="text-2xl font-semibold">Confirmando seu e-mail</h1>
        <Spinner aria-label="Confirmando" />
      </>
    );
  }

  return <div className="flex max-w-xl flex-col gap-4">{content}</div>;
}
