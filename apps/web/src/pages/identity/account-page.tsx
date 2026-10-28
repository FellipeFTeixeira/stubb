import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { describeCommandError } from '@/api/command-errors';
import { getMe, listMyOrganizerRequests } from '@/api/identity';
import { identityKeys } from '@/api/query-keys';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ROLE_LABELS } from '@/features/identity/format';
import { OrganizerRequestForm } from '@/features/identity/organizer-request-form';
import { OrganizerRequestHistory } from '@/features/identity/organizer-request-history';
import { useSession } from '@/features/session/session-provider';

const POLL_WHILE_PENDING_MS = 10_000;

export function AccountPage() {
  const queryClient = useQueryClient();
  const { hasRole, refresh } = useSession();
  const me = useQuery({ queryKey: identityKeys.me, queryFn: getMe });
  const requests = useQuery({
    queryKey: identityKeys.myOrganizerRequests,
    queryFn: listMyOrganizerRequests,
    // Com pedido pendente, acompanha a decisão do admin sem o usuário recarregar a página.
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === 'pending')
        ? POLL_WHILE_PENDING_MS
        : false,
  });

  const items = requests.data?.items;
  const latest = items?.[0];
  const hasPending = items?.some((item) => item.status === 'pending') ?? false;
  const isOrganizer = hasRole('organizer');

  // Pedido aprovado e token ainda sem o papel: renova a sessão uma vez para o token novo trazer
  // `organizer` (o refresh relê os papéis no banco) e recarrega os dados da conta.
  const refreshedAfterApproval = useRef(false);
  useEffect(() => {
    if (latest?.status !== 'approved' || isOrganizer || refreshedAfterApproval.current) return;
    refreshedAfterApproval.current = true;
    void refresh().then(() => queryClient.invalidateQueries({ queryKey: identityKeys.me }));
  }, [latest?.status, isOrganizer, refresh, queryClient]);

  const serverSaysOrganizer = me.data?.roles.includes('organizer') ?? false;
  const canRequest =
    items !== undefined &&
    me.data !== undefined &&
    !isOrganizer &&
    !serverSaysOrganizer &&
    !hasPending;

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-semibold">Minha conta</h1>

      <section aria-labelledby="account-data" className="flex flex-col gap-2">
        <h2 id="account-data" className="text-lg font-medium">
          Seus dados
        </h2>
        {me.isPending && <Skeleton className="h-20 w-full" />}
        {me.isError && <Alert variant="destructive">{describeCommandError(me.error)}</Alert>}
        {me.data && (
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Nome</dt>
            <dd>{me.data.fullName}</dd>
            <dt className="text-muted-foreground">E-mail</dt>
            <dd>{me.data.email}</dd>
            <dt className="text-muted-foreground">CPF</dt>
            <dd>{me.data.cpf}</dd>
            <dt className="text-muted-foreground">Papéis</dt>
            <dd>{me.data.roles.map((role) => ROLE_LABELS[role]).join(', ')}</dd>
          </dl>
        )}
        {isOrganizer && (
          <p>
            <Link to="/produtor/eventos" className="underline">
              Área do produtor
            </Link>
          </p>
        )}
      </section>

      <section aria-labelledby="account-sell" className="flex flex-col gap-4">
        <h2 id="account-sell" className="text-lg font-medium">
          Quero vender ingressos
        </h2>
        {requests.isError && (
          <Alert variant="destructive">{describeCommandError(requests.error)}</Alert>
        )}
        {hasPending && (
          <p className="text-sm text-muted-foreground">
            Seu pedido está em análise. Esta página atualiza sozinha quando o admin decidir.
          </p>
        )}
        {canRequest && <OrganizerRequestForm />}
        {requests.isPending && <Skeleton className="h-16 w-full" />}
        {items !== undefined && (
          <>
            <h3 className="text-base font-medium">Histórico de pedidos</h3>
            <OrganizerRequestHistory items={items} />
          </>
        )}
      </section>
    </div>
  );
}
