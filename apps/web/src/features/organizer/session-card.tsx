import type { CommandAccepted, OrganizerEventView } from '@stubb/contracts';
import { useId } from 'react';
import {
  addBatch,
  addSessionSector,
  publishSession,
  removeBatch,
  removeSession,
  removeSessionSector,
} from '@/api/catalog-organizer';
import { Badge } from '@/components/ui/badge';
import {
  BATCH_BADGE_LABELS,
  SECTOR_KIND_LABELS,
  SESSION_STATUS_LABELS,
} from '@/lib/catalog-labels';
import { formatDateTime, formatMoney } from '@/lib/format';
import { BatchForm } from './batch-form';
import { CommandButton } from './command-button';
import { SessionSectorAddForm } from './session-sector-add-form';
import { useVenue } from './use-organizer-queries';

export type OrganizerSession = OrganizerEventView['sessions'][number];
type SessionSector = OrganizerSession['sectors'][number];

type Props = {
  eventId: string;
  session: OrganizerSession;
  onAccepted: (result: CommandAccepted) => void;
};

export function SessionCard({ eventId, session, onAccepted }: Props) {
  const headingId = useId();
  const idPrefix = useId();
  const isDraft = session.status === 'draft';
  // A planta atual do local (não a cópia da sessão) diz quais setores ainda podem entrar.
  const { query: venueQuery } = useVenue(isDraft ? session.venueId : undefined);
  const venue = venueQuery.data?.status === 'found' ? venueQuery.data.venue : null;
  const inSession = new Set(session.sectors.map((sector) => sector.venueSectorId));
  const addable = (venue?.sectors ?? []).filter((sector) => !inSession.has(sector.id));
  const title = `Sessão de ${formatDateTime(session.startsAt, session.timeZone)}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 rounded-lg border p-4">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={headingId} className="text-lg font-medium">
            {title}
          </h3>
          <Badge variant={isDraft ? 'secondary' : 'default'}>
            {SESSION_STATUS_LABELS[session.status]}
          </Badge>
          {session.ended && <Badge variant="outline">Encerrada</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {session.venue
            ? `${session.venue.name} — ${session.venue.address}, ${session.venue.city}/${session.venue.state}`
            : 'Dados do local ainda não disponíveis'}
        </p>
        <p className="text-sm text-muted-foreground">
          {`Início das vendas: ${formatDateTime(session.salesStartsAt, session.timeZone)} (${session.timeZone})`}
        </p>
      </header>

      {isDraft && (
        <div className="flex flex-wrap gap-2">
          <CommandButton
            label="Publicar sessão"
            variant="default"
            variables={{ sessionId: session.id }}
            send={(v, key) => publishSession(eventId, v.sessionId, key)}
            onAccepted={onAccepted}
          />
          <CommandButton
            label="Remover sessão"
            variables={{ sessionId: session.id }}
            send={(v, key) => removeSession(eventId, v.sessionId, key)}
            onAccepted={onAccepted}
          />
        </div>
      )}

      <div className="flex flex-col gap-4">
        {session.sectors.map((sector) => (
          <SessionSectorCard
            key={sector.id}
            eventId={eventId}
            session={session}
            sector={sector}
            onAccepted={onAccepted}
          />
        ))}
        {session.sectors.length === 0 && (
          <p className="text-sm text-muted-foreground">Esta sessão ainda não tem setores.</p>
        )}
      </div>

      {isDraft && (
        <SessionSectorAddForm
          idPrefix={`${idPrefix}-add-sector`}
          options={addable}
          send={(body, key) => addSessionSector(eventId, session.id, body, key)}
          onAccepted={onAccepted}
        />
      )}
    </section>
  );
}

function SessionSectorCard({
  eventId,
  session,
  sector,
  onAccepted,
}: {
  eventId: string;
  session: OrganizerSession;
  sector: SessionSector;
  onAccepted: (result: CommandAccepted) => void;
}) {
  const headingId = useId();
  const idPrefix = useId();
  const isDraft = session.status === 'draft';
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 id={headingId} className="font-medium">
            {sector.name}
          </h4>
          <p className="text-sm text-muted-foreground">
            {`${SECTOR_KIND_LABELS[sector.kind]} — capacidade ${sector.capacity}`}
          </p>
        </div>
        {isDraft && (
          <CommandButton
            label={`Remover setor ${sector.name}`}
            variables={{ sessionSectorId: sector.id }}
            send={(v, key) => removeSessionSector(eventId, session.id, v.sessionSectorId, key)}
            onAccepted={onAccepted}
          />
        )}
      </div>

      {sector.batches.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum lote cadastrado.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sector.batches.map((batch) => (
            <li key={batch.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{batch.name}</span>
              <span>{formatMoney(batch.priceCents)}</span>
              <span className="text-muted-foreground">
                {batch.quantity === null
                  ? 'sem limite de quantidade'
                  : `${batch.quantity} ingressos`}
              </span>
              {batch.endsAt && (
                <span className="text-muted-foreground">
                  {`até ${formatDateTime(batch.endsAt, session.timeZone)}`}
                </span>
              )}
              <Badge variant={batch.badge === 'current' ? 'default' : 'outline'}>
                {BATCH_BADGE_LABELS[batch.badge]}
              </Badge>
              {isDraft && (
                <CommandButton
                  label={`Remover lote ${batch.name}`}
                  variables={{ sessionSectorId: sector.id, batchId: batch.id }}
                  send={(v, key) =>
                    removeBatch(eventId, session.id, v.sessionSectorId, v.batchId, key)
                  }
                  onAccepted={onAccepted}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {isDraft && (
        <BatchForm
          idPrefix={`${idPrefix}-batch`}
          timeZone={session.timeZone}
          send={(body, key) => addBatch(eventId, session.id, sector.id, body, key)}
          onAccepted={onAccepted}
        />
      )}
    </section>
  );
}
