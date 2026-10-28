import { ORGANIZER_REQUEST_STATUSES, type OrganizerRequestStatus } from '@stubb/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { describeCommandError } from '@/api/command-errors';
import { listAdminOrganizerRequests } from '@/api/identity';
import { identityKeys } from '@/api/query-keys';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminRequestCard } from '@/features/identity/admin-request-card';
import { STATUS_LABELS } from '@/features/identity/format';

const PAGE_SIZE = 20;

const TAB_LABELS: Record<OrganizerRequestStatus, string> = {
  pending: 'Pendentes',
  approved: 'Aprovados',
  rejected: 'Recusados',
};

function parseStatus(value: string | null): OrganizerRequestStatus {
  return ORGANIZER_REQUEST_STATUSES.find((status) => status === value) ?? 'pending';
}

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export function AdminOrganizerRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = parseStatus(searchParams.get('status'));
  const page = parsePage(searchParams.get('page'));
  const params = { status, page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: identityKeys.adminOrganizerRequests(params),
    queryFn: () => listAdminOrganizerRequests(params),
    placeholderData: keepPreviousData,
  });

  const go = (next: { status?: OrganizerRequestStatus; page?: number }) => {
    const target = new URLSearchParams(searchParams);
    target.set('status', next.status ?? status);
    target.set('page', String(next.page ?? 1));
    setSearchParams(target);
  };

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Pedidos de produtor</h1>
      <Tabs value={status} onValueChange={(value) => go({ status: parseStatus(value) })}>
        <TabsList>
          {ORGANIZER_REQUEST_STATUSES.map((value) => (
            <TabsTrigger key={value} value={value}>
              {TAB_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={status} className="flex flex-col gap-4 pt-4">
          {list.isPending && <Skeleton className="h-32 w-full" />}
          {list.isError && <Alert variant="destructive">{describeCommandError(list.error)}</Alert>}
          {list.data && list.data.items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum pedido {STATUS_LABELS[status].toLowerCase()}.
            </p>
          )}
          {list.data?.items.map((request) => (
            <AdminRequestCard key={request.id} request={request} />
          ))}
          {list.data && list.data.total > list.data.pageSize && (
            <nav aria-label="Paginação" className="flex items-center gap-3 text-sm">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => go({ page: page - 1 })}
              >
                Anterior
              </Button>
              <span>
                Página {page} de {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => go({ page: page + 1 })}
              >
                Próxima
              </Button>
            </nav>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
