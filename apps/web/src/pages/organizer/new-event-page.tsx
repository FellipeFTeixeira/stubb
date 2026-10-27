import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { createEvent } from '@/api/catalog-organizer';
import { ProjectionStatus } from '@/components/projection-status';
import { EventDetailsForm } from '@/features/organizer/event-details-form';
import {
  useInvalidateListsOnSynced,
  useOrganizerEvent,
} from '@/features/organizer/use-organizer-queries';

export function NewEventPage() {
  const navigate = useNavigate();
  const idPrefix = useId();
  // Depois do command, espera o read model alcançar a versão 1 e só então abre a gestão.
  const [created, setCreated] = useState<{ id: string; version: number } | null>(null);
  const { status, restart } = useOrganizerEvent(created?.id, created?.version);
  useInvalidateListsOnSynced(status, { events: true });

  useEffect(() => {
    if (created && status === 'synced') void navigate(`/produtor/eventos/${created.id}`);
  }, [created, status, navigate]);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Novo evento</h1>
      <EventDetailsForm
        idPrefix={`${idPrefix}-event`}
        submitLabel="Criar evento"
        send={createEvent}
        onAccepted={(result) => setCreated({ id: result.id, version: result.version })}
      />
      <ProjectionStatus status={status} onRestart={restart} />
    </div>
  );
}
