import type { OrganizerEventView } from '@stubb/contracts';
import { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { scheduleSession, updateEventDetails } from '@/api/catalog-organizer';
import { describeCommandError } from '@/api/command-errors';
import { ProjectionStatus } from '@/components/projection-status';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AGE_RATING_LABELS, CATEGORY_LABELS, EVENT_STATUS_LABELS } from '@/lib/catalog-labels';
import { DiscardEventControl } from '@/features/organizer/discard-event-control';
import { EventDetailsForm } from '@/features/organizer/event-details-form';
import { CONFLICT_MESSAGE } from '@/features/organizer/is-conflict';
import { ScheduleSessionForm } from '@/features/organizer/schedule-session-form';
import { SessionCard } from '@/features/organizer/session-card';
import {
  useInvalidateListsOnSynced,
  useOrganizerEvent,
  useVenues,
} from '@/features/organizer/use-organizer-queries';

export function EventManagePage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [minVersion, setMinVersion] = useState<number | undefined>(undefined);
  const [discarding, setDiscarding] = useState(false);
  const [formEpoch, setFormEpoch] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const { query, status, restart } = useOrganizerEvent(eventId, minVersion);
  useInvalidateListsOnSynced(status, { events: true });

  // O descarte termina quando a leitura alcança a lápide (404 com minVersionReached).
  useEffect(() => {
    if (discarding && status === 'synced') void navigate('/produtor/eventos');
  }, [discarding, status, navigate]);

  const data = query.data;
  const event = data?.status === 'found' ? data.event : null;
  const accepted = (result: { version: number }) => {
    setNotice(null);
    setMinVersion(result.version);
  };

  if (query.isError) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Gerenciar evento</h1>
        <Alert variant="destructive">{describeCommandError(query.error)}</Alert>
      </div>
    );
  }
  if (data === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Gerenciar evento</h1>
        <p className="text-sm text-muted-foreground">Carregando evento…</p>
      </div>
    );
  }
  if (event === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Evento não encontrado</h1>
        <ProjectionStatus status={status} onRestart={restart} />
        <Link to="/produtor/eventos" className="underline">
          Voltar para Meus eventos
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link to="/produtor/eventos" className="text-sm underline">
          Meus eventos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{event.title}</h1>
          <Badge variant={event.status === 'published' ? 'default' : 'secondary'}>
            {EVENT_STATUS_LABELS[event.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {`${CATEGORY_LABELS[event.category as keyof typeof CATEGORY_LABELS] ?? event.category} · ${
            AGE_RATING_LABELS[event.ageRating as keyof typeof AGE_RATING_LABELS] ?? event.ageRating
          }`}
        </p>
      </div>
      <ProjectionStatus status={status} onRestart={restart} />

      <EventDetailsSection
        event={event}
        formKey={`${event.version}:${formEpoch}`}
        notice={notice}
        onAccepted={accepted}
        onConflict={() => {
          setNotice(CONFLICT_MESSAGE);
          setFormEpoch((value) => value + 1);
          restart();
        }}
      />

      <SessionsSection event={event} onAccepted={accepted} />

      {event.status === 'draft' && (
        <section className="flex flex-col gap-2 border-t pt-4">
          <DiscardEventControl
            eventId={event.id}
            onAccepted={(result) => {
              setDiscarding(true);
              accepted(result);
            }}
          />
        </section>
      )}
    </div>
  );
}

function EventDetailsSection({
  event,
  formKey,
  notice,
  onAccepted,
  onConflict,
}: {
  event: OrganizerEventView;
  formKey: string;
  notice: string | null;
  onAccepted: (result: { version: number }) => void;
  onConflict: () => void;
}) {
  const headingId = useId();
  const idPrefix = useId();
  return (
    <section aria-labelledby={headingId} className="flex max-w-xl flex-col gap-4">
      <h2 id={headingId} className="text-lg font-medium">
        Dados do evento
      </h2>
      {notice && <Alert variant="destructive">{notice}</Alert>}
      {/* Remonta com a versão (ou após um 409) para o formulário reabrir com os dados novos. */}
      <EventDetailsForm
        key={formKey}
        idPrefix={`${idPrefix}-details`}
        submitLabel="Salvar dados do evento"
        defaultValues={{
          title: event.title,
          description: event.description,
          category: event.category,
          ageRating: event.ageRating,
          imageUrl: event.imageUrl ?? '',
        }}
        send={(body, key) =>
          updateEventDetails(event.id, { ...body, expectedVersion: event.version }, key)
        }
        onAccepted={onAccepted}
        onConflict={onConflict}
      />
    </section>
  );
}

function SessionsSection({
  event,
  onAccepted,
}: {
  event: OrganizerEventView;
  onAccepted: (result: { version: number }) => void;
}) {
  const headingId = useId();
  const scheduleHeadingId = useId();
  const idPrefix = useId();
  const venues = useVenues();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-lg font-medium">
        Sessões
      </h2>
      {event.sessions.length === 0 && (
        <p className="text-muted-foreground">Este evento ainda não tem sessões.</p>
      )}
      {event.sessions.map((session) => (
        <SessionCard
          key={session.id}
          eventId={event.id}
          session={session}
          onAccepted={onAccepted}
        />
      ))}
      <section
        aria-labelledby={scheduleHeadingId}
        className="flex max-w-xl flex-col gap-3 border-t pt-4"
      >
        <h3 id={scheduleHeadingId} className="font-medium">
          Nova sessão
        </h3>
        {venues.isError && (
          <Alert variant="destructive">{describeCommandError(venues.error)}</Alert>
        )}
        <ScheduleSessionForm
          idPrefix={`${idPrefix}-schedule`}
          venues={venues.data?.items ?? NO_VENUES}
          send={(body, key) => scheduleSession(event.id, body, key)}
          onAccepted={onAccepted}
        />
      </section>
    </section>
  );
}

const NO_VENUES: never[] = [];
