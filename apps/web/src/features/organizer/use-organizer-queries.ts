import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getOrganizerEvent, getVenue, listVenues } from '@/api/catalog-organizer';
import { catalogKeys } from '@/api/query-keys';
import { useVersionedQuery } from '@/lib/read-your-writes';

const NO_ID = ['catalog', 'organizer', 'none'] as const;

// Leitura do evento do produtor com read-your-writes: `minVersion` = versão devolvida pelo
// último command; a leitura repete até o read model alcançar (ou o limite de 10 s estourar).
export function useOrganizerEvent(eventId: string | undefined, minVersion?: number) {
  return useVersionedQuery({
    queryKey: eventId === undefined ? NO_ID : catalogKeys.organizerEvent(eventId),
    queryFn: (version) => getOrganizerEvent(eventId as string, version),
    minVersion,
    enabled: eventId !== undefined,
  });
}

export function useVenue(venueId: string | undefined, minVersion?: number) {
  return useVersionedQuery({
    queryKey: venueId === undefined ? NO_ID : catalogKeys.organizerVenue(venueId),
    queryFn: (version) => getVenue(venueId as string, version),
    minVersion,
    enabled: venueId !== undefined,
  });
}

export function useVenues() {
  return useQuery({ queryKey: catalogKeys.organizerVenues, queryFn: listVenues });
}

// Quando a projeção alcança a versão do command, as listas deixam de estar atualizadas.
export function useInvalidateListsOnSynced(
  status: 'idle' | 'waiting' | 'synced' | 'timed-out',
  lists: { events?: boolean; venues?: boolean },
) {
  const queryClient = useQueryClient();
  const { events = false, venues = false } = lists;
  useEffect(() => {
    if (status !== 'synced') return;
    if (events) void queryClient.invalidateQueries({ queryKey: catalogKeys.organizerEvents });
    if (venues) void queryClient.invalidateQueries({ queryKey: catalogKeys.organizerVenues });
  }, [status, events, venues, queryClient]);
}
