import { Link, Outlet } from 'react-router';

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
            <Link to="/produtor/eventos" className="hover:underline">
              Área do produtor
            </Link>
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
