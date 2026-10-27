import { useQuery } from '@tanstack/react-query';
import { getEvent } from '@/api/catalog-public';
import { catalogKeys } from '@/api/query-keys';

export function useEvent(id: string) {
  return useQuery({
    queryKey: catalogKeys.publicEvent(id),
    queryFn: () => getEvent(id),
    retry: false,
  });
}
