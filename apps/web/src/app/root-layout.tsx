import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from 'react-router';
import { identityKeys } from '@/api/query-keys';
import { getMe } from '@/api/identity';
import { Button } from '@/components/ui/button';
import { useSession } from '@/features/session/session-provider';

function AccountNav() {
  const { status, user, hasRole, signOut } = useSession();
  const navigate = useNavigate();
  const me = useQuery({
    queryKey: identityKeys.me,
    queryFn: getMe,
    enabled: status === 'authenticated',
    retry: false,
  });

  if (status === 'loading') return null;

  if (user === null) {
    return (
      <>
        <Link to="/entrar" className="hover:underline">
          Entrar
        </Link>
        <Link to="/cadastro" className="hover:underline">
          Criar conta
        </Link>
      </>
    );
  }

  return (
    <>
      {me.data !== undefined && (
        <span className="text-muted-foreground" data-testid="session-name">
          {me.data.fullName}
        </span>
      )}
      <Link to="/conta" className="hover:underline">
        Minha conta
      </Link>
      {hasRole('organizer') && (
        <Link to="/produtor/eventos" className="hover:underline">
          Área do produtor
        </Link>
      )}
      {hasRole('admin') && (
        <Link to="/admin/produtores" className="hover:underline">
          Administração
        </Link>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          void signOut().finally(() => void navigate('/'));
        }}
      >
        Sair
      </Button>
    </>
  );
}

export function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <nav
          aria-label="Principal"
          className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3"
        >
          <Link to="/" className="text-lg font-semibold">
            Stubb
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <AccountNav />
            <Link to="/diagnostico" className="text-muted-foreground hover:underline">
              Diagnóstico
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <Outlet />
      </main>
      <footer className="border-t">
        <p className="mx-auto max-w-5xl px-6 py-3 text-xs text-muted-foreground">
          Stubb é um projeto de estudo, sem fins lucrativos.
        </p>
      </footer>
    </div>
  );
}
