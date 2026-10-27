import { CATALOG_PAGE_SIZE, EVENT_CATEGORIES } from '@stubb/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { listEvents, type ShowcaseFilters } from '@/api/catalog-public';
import { catalogKeys } from '@/api/query-keys';

type Category = (typeof EVENT_CATEGORIES)[number];

function isCategory(value: string | null): value is Category {
  return value !== null && (EVENT_CATEGORIES as readonly string[]).includes(value);
}

// Os filtros vivem na URL (I-11): `busca`, `cidade`, `categoria`. Categoria desconhecida é ignorada
// (mandá-la ao servidor daria 400).
export function useShowcaseFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const busca = searchParams.get('busca')?.trim() ?? '';
  const cidade = searchParams.get('cidade')?.trim() ?? '';
  const categoria = searchParams.get('categoria');

  const filters: ShowcaseFilters = {
    ...(busca !== '' ? { q: busca } : {}),
    ...(cidade !== '' ? { city: cidade } : {}),
    ...(isCategory(categoria) ? { category: categoria } : {}),
  };

  const apply = (next: ShowcaseFilters) => {
    const params = new URLSearchParams();
    if (next.q) params.set('busca', next.q);
    if (next.city) params.set('cidade', next.city);
    if (next.category) params.set('categoria', next.category);
    setSearchParams(params);
  };

  return { filters, apply };
}

export function useShowcase(filters: ShowcaseFilters) {
  return useInfiniteQuery({
    queryKey: catalogKeys.publicEvents(filters),
    queryFn: ({ pageParam }) =>
      listEvents({ ...filters, page: pageParam, pageSize: CATALOG_PAGE_SIZE.default }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0);
      return lastPage.items.length > 0 && loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    retry: false,
  });
}
