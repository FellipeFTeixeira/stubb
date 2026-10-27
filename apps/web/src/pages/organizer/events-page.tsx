import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { listOrganizerEvents } from '@/api/catalog-organizer';
import { describeCommandError } from '@/api/command-errors';
import { catalogKeys } from '@/api/query-keys';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CATEGORY_LABELS, EVENT_STATUS_LABELS } from '@/lib/catalog-labels';

export function OrganizerEventsPage() {
  const { data, isPending, isError, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: catalogKeys.organizerEvents,
      queryFn: ({ pageParam }) => listOrganizerEvents(pageParam),
      initialPageParam: 1,
      getNextPageParam: (last, pages) => {
        const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
        return loaded < last.total ? last.page + 1 : undefined;
      },
    });
  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Meus eventos</h1>
        <Button asChild>
          <Link to="/produtor/eventos/novo">Novo evento</Link>
        </Button>
      </div>
      {isPending && <p className="text-sm text-muted-foreground">Carregando eventos…</p>}
      {isError && <Alert variant="destructive">{describeCommandError(error)}</Alert>}
      {data && items.length === 0 && (
        <p className="text-muted-foreground">Você ainda não criou nenhum evento.</p>
      )}
      {items.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {items.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="flex flex-col gap-0.5">
                <Link to={`/produtor/eventos/${event.id}`} className="font-medium underline">
                  {event.title}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {`${CATEGORY_LABELS[event.category as keyof typeof CATEGORY_LABELS] ?? event.category} · ${event.sessionsCount} ${
                    event.sessionsCount === 1 ? 'sessão' : 'sessões'
                  } (${event.publishedSessionsCount} ${
                    event.publishedSessionsCount === 1 ? 'publicada' : 'publicadas'
                  })`}
                </span>
              </div>
              <Badge variant={event.status === 'published' ? 'default' : 'secondary'}>
                {EVENT_STATUS_LABELS[event.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {hasNextPage && (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  );
}
