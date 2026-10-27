import { EVENT_CATEGORIES } from '@stubb/contracts';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionSection } from '@/features/event-page/session-section';
import { useEvent } from '@/features/event-page/use-event';
import { AGE_RATING_LABELS, CATEGORY_LABELS } from '@/lib/catalog-labels';

type Category = (typeof EVENT_CATEGORIES)[number];

function EventImage({
  src,
  category,
  title,
}: {
  src: string | null;
  category: Category;
  title: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={src !== null && !failed ? src : `/placeholders/${category}.svg`}
      alt={title}
      onError={() => setFailed(true)}
      className="aspect-video w-full max-w-xl rounded-lg object-cover"
    />
  );
}

export function EventPage() {
  const { eventId = '' } = useParams();
  const query = useEvent(eventId);

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Evento</h1>
        <div role="status" aria-label="Carregando evento">
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Evento</h1>
        <Alert variant="destructive">
          <AlertDescription>Não foi possível carregar o evento.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (query.data.status === 'not-found') {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Evento não encontrado</h1>
        <Link to="/" className="underline">
          Voltar para a vitrine
        </Link>
      </div>
    );
  }

  const { event } = query.data;
  const category = (EVENT_CATEGORIES as readonly string[]).includes(event.category)
    ? (event.category as Category)
    : 'other';
  const ageRating = (AGE_RATING_LABELS as Record<string, string>)[event.ageRating];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{CATEGORY_LABELS[category]}</Badge>
          <Badge variant="outline">{ageRating ?? event.ageRating}</Badge>
          {event.ended && <Badge variant="destructive">Evento encerrado</Badge>}
        </div>
        <EventImage src={event.imageUrl} category={category} title={event.title} />
        <p className="whitespace-pre-line">{event.description}</p>
      </div>
      <div className="flex flex-col gap-4">
        {event.sessions.map((session) => (
          <SessionSection key={session.id} session={session} />
        ))}
      </div>
    </div>
  );
}
