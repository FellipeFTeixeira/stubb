import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EventCard } from '@/features/showcase/event-card';
import { ShowcaseFiltersForm } from '@/features/showcase/showcase-filters';
import { useShowcase, useShowcaseFilters } from '@/features/showcase/use-showcase';

export function ShowcasePage() {
  const { filters, apply } = useShowcaseFilters();
  const query = useShowcase(filters);
  const cards = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Eventos</h1>
      <ShowcaseFiltersForm key={JSON.stringify(filters)} filters={filters} onApply={apply} />

      {query.isPending && (
        <div role="status" aria-label="Carregando eventos" className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      )}

      {query.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar os eventos.{' '}
            <Button variant="link" className="h-auto p-0" onClick={() => void query.refetch()}>
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {query.isSuccess && cards.length === 0 && <p>Nenhum evento encontrado.</p>}

      {cards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <EventCard key={card.id} card={card} />
          ))}
        </div>
      )}

      {query.hasNextPage && (
        <div>
          <Button
            variant="outline"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  );
}
