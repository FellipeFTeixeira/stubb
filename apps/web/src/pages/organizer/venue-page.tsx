import type { VenueView } from '@stubb/contracts';
import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { addVenueSector, removeVenueSector, updateVenueDetails } from '@/api/catalog-organizer';
import { describeCommandError } from '@/api/command-errors';
import { ProjectionStatus } from '@/components/projection-status';
import { Alert } from '@/components/ui/alert';
import { CommandButton } from '@/features/organizer/command-button';
import { CONFLICT_MESSAGE } from '@/features/organizer/is-conflict';
import { useInvalidateListsOnSynced, useVenue } from '@/features/organizer/use-organizer-queries';
import { VenueDetailsForm } from '@/features/organizer/venue-details-form';
import { VenueSectorForm } from '@/features/organizer/venue-sector-form';
import { SECTOR_KIND_LABELS } from '@/lib/catalog-labels';

export function VenuePage() {
  const { venueId } = useParams();
  const [minVersion, setMinVersion] = useState<number | undefined>(undefined);
  const [formEpoch, setFormEpoch] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const { query, status, restart } = useVenue(venueId, minVersion);
  useInvalidateListsOnSynced(status, { venues: true });

  const data = query.data;
  const venue = data?.status === 'found' ? data.venue : null;
  const accepted = (result: { version: number }) => {
    setNotice(null);
    setMinVersion(result.version);
  };

  if (query.isError) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Local</h1>
        <Alert variant="destructive">{describeCommandError(query.error)}</Alert>
      </div>
    );
  }
  if (data === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Local</h1>
        <p className="text-sm text-muted-foreground">Carregando local…</p>
      </div>
    );
  }
  if (venue === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Local não encontrado</h1>
        <Link to="/produtor/locais" className="underline">
          Voltar para Locais
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link to="/produtor/locais" className="text-sm underline">
          Locais
        </Link>
        <h1 className="text-2xl font-semibold">{venue.name}</h1>
      </div>
      <ProjectionStatus status={status} onRestart={restart} />

      <VenueDetailsSection
        venue={venue}
        formKey={`${venue.version}:${formEpoch}`}
        notice={notice}
        onAccepted={accepted}
        onConflict={() => {
          setNotice(CONFLICT_MESSAGE);
          setFormEpoch((value) => value + 1);
          restart();
        }}
      />

      <PlantSection venue={venue} onAccepted={accepted} />
    </div>
  );
}

function VenueDetailsSection({
  venue,
  formKey,
  notice,
  onAccepted,
  onConflict,
}: {
  venue: VenueView;
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
        Dados do local
      </h2>
      {notice && <Alert variant="destructive">{notice}</Alert>}
      {/* Remonta com a versão (ou após um 409) para o formulário reabrir com os dados novos. */}
      <VenueDetailsForm
        key={formKey}
        idPrefix={`${idPrefix}-details`}
        submitLabel="Salvar dados do local"
        defaultValues={{
          name: venue.name,
          address: venue.address,
          city: venue.city,
          state: venue.state,
          timeZone: venue.timeZone,
        }}
        send={(body, key) =>
          updateVenueDetails(venue.id, { ...body, expectedVersion: venue.version }, key)
        }
        onAccepted={onAccepted}
        onConflict={onConflict}
      />
    </section>
  );
}

function PlantSection({
  venue,
  onAccepted,
}: {
  venue: VenueView;
  onAccepted: (result: { version: number }) => void;
}) {
  const headingId = useId();
  const formHeadingId = useId();
  const idPrefix = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-lg font-medium">
        Planta
      </h2>
      {venue.sectors.length === 0 ? (
        <p className="text-muted-foreground">
          Este local ainda não tem setores. Adicione pelo menos um para poder agendar sessões.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {venue.sectors.map((sector) => (
            <SectorItem key={sector.id} venue={venue} sector={sector} onAccepted={onAccepted} />
          ))}
        </div>
      )}
      <div className="flex max-w-xl flex-col gap-3 border-t pt-4">
        <h3 id={formHeadingId} className="font-medium">
          Novo setor
        </h3>
        <VenueSectorForm
          idPrefix={`${idPrefix}-sector`}
          send={(body, key) => addVenueSector(venue.id, body, key)}
          onAccepted={onAccepted}
        />
      </div>
    </section>
  );
}

function SectorItem({
  venue,
  sector,
  onAccepted,
}: {
  venue: VenueView;
  sector: VenueView['sectors'][number];
  onAccepted: (result: { version: number }) => void;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
    >
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="font-medium">
          {sector.name}
        </h3>
        <p className="text-sm text-muted-foreground">
          {`${SECTOR_KIND_LABELS[sector.kind]} — capacidade ${sector.capacity}`}
        </p>
        {sector.rows && (
          <ul className="text-sm text-muted-foreground">
            {sector.rows.map((row) => (
              <li key={row.label}>{`Fila ${row.label}: ${row.seats} assentos`}</li>
            ))}
          </ul>
        )}
      </div>
      <CommandButton
        label={`Remover setor ${sector.name}`}
        variables={{ venueSectorId: sector.id }}
        send={(v, key) => removeVenueSector(venue.id, v.venueSectorId, key)}
        onAccepted={onAccepted}
      />
    </section>
  );
}
