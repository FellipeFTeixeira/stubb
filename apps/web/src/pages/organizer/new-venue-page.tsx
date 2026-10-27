import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { registerVenue } from '@/api/catalog-organizer';
import { ProjectionStatus } from '@/components/projection-status';
import { VenueDetailsForm } from '@/features/organizer/venue-details-form';
import { useInvalidateListsOnSynced, useVenue } from '@/features/organizer/use-organizer-queries';

export function NewVenuePage() {
  const navigate = useNavigate();
  const idPrefix = useId();
  // Depois do command, espera o read model alcançar a versão 1 e só então abre o local.
  const [created, setCreated] = useState<{ id: string; version: number } | null>(null);
  const { status, restart } = useVenue(created?.id, created?.version);
  useInvalidateListsOnSynced(status, { venues: true });

  useEffect(() => {
    if (created && status === 'synced') void navigate(`/produtor/locais/${created.id}`);
  }, [created, status, navigate]);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Novo local</h1>
      <VenueDetailsForm
        idPrefix={`${idPrefix}-venue`}
        submitLabel="Cadastrar local"
        send={registerVenue}
        onAccepted={(result) => setCreated({ id: result.id, version: result.version })}
      />
      <ProjectionStatus status={status} onRestart={restart} />
    </div>
  );
}
