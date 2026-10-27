import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 p-6">
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <Link to="/" className="underline">
        Voltar para a vitrine
      </Link>
    </div>
  );
}
