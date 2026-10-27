import { Link } from 'react-router';
import { describeCommandError } from '@/api/command-errors';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useVenues } from '@/features/organizer/use-organizer-queries';

export function VenuesPage() {
  const { data, isPending, isError, error } = useVenues();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Locais</h1>
        <Button asChild>
          <Link to="/produtor/locais/novo">Novo local</Link>
        </Button>
      </div>
      {isPending && <p className="text-sm text-muted-foreground">Carregando locais…</p>}
      {isError && <Alert variant="destructive">{describeCommandError(error)}</Alert>}
      {data && data.items.length === 0 && (
        <p className="text-muted-foreground">Nenhum local cadastrado.</p>
      )}
      {data && data.items.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {data.items.map((venue) => (
            <li key={venue.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <Link to={`/produtor/locais/${venue.id}`} className="font-medium underline">
                {venue.name}
              </Link>
              <span className="text-sm text-muted-foreground">
                {`${venue.city}/${venue.state} · ${venue.sectorsCount} ${
                  venue.sectorsCount === 1 ? 'setor' : 'setores'
                }`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
