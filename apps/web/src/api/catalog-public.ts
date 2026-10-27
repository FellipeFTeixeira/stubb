import {
  CATALOG_PAGE_SIZE,
  GetEventResponseSchema,
  ListEventsResponseSchema,
  catalogRoutes,
  type GetEventResponse,
  type ListEventsResponse,
} from '@stubb/contracts';
import { ApiError, getJson, withQuery } from './http';

export type ShowcaseFilters = { q?: string; city?: string; category?: string };

export async function listEvents(
  filters: ShowcaseFilters & { page: number; pageSize?: number },
): Promise<ListEventsResponse> {
  const result = await getJson(
    withQuery(catalogRoutes.events, {
      q: filters.q,
      city: filters.city,
      category: filters.category,
      page: filters.page,
      pageSize: filters.pageSize ?? CATALOG_PAGE_SIZE.default,
    }),
    ListEventsResponseSchema,
  );
  // A lista nunca responde 404; se acontecer, é falha de servidor, não "vazio".
  if (result.status === 'not-found') throw new ApiError(404, null);
  return result.data;
}

export type GetEventResult = ({ status: 'found' } & GetEventResponse) | { status: 'not-found' };

export async function getEvent(id: string): Promise<GetEventResult> {
  const result = await getJson(catalogRoutes.event(id), GetEventResponseSchema);
  return result.status === 'found' ? { status: 'found', ...result.data } : { status: 'not-found' };
}
