import type { UserRole } from '@stubb/contracts';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from './session-provider';

// Só aceita caminho interno ("/x"): "//evil.com" e URL absoluta viram "/" (open redirect).
// eslint-disable-next-line react-refresh/only-export-components
export function safeRedirect(value: string | null): string {
  if (value === null || !value.startsWith('/') || value.startsWith('//')) return '/';
  // Barra invertida: alguns navegadores a tratam como "/", então "/\evil.com" vira "//evil.com".
  if (value.startsWith('/\\')) return '/';
  return value;
}

export function AccessDenied() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 p-6">
      <h1 className="text-2xl font-semibold">Acesso negado</h1>
      <p className="text-muted-foreground">Sua conta não tem permissão para ver esta página.</p>
      <Link to="/" className="underline">
        Voltar para a vitrine
      </Link>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex justify-center p-6">
        <Spinner aria-label="Carregando" />
      </div>
    );
  }
  if (status === 'anonymous') {
    const target = `${location.pathname}${location.search}`;
    return <Navigate to={`/entrar?redirect=${encodeURIComponent(target)}`} replace />;
  }
  return children;
}

export function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const { hasRole } = useSession();
  return <RequireAuth>{hasRole(role) ? children : <AccessDenied />}</RequireAuth>;
}
