import type { OrganizerRequestView } from '@stubb/contracts';
import { Card, CardContent } from '@/components/ui/card';
import { formatCnpj, formatDateTime } from './format';
import { RequestStatusBadge } from './request-status-badge';

export function OrganizerRequestHistory({ items }: { items: OrganizerRequestView[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Você ainda não enviou nenhum pedido.</p>;
  }
  return (
    <ul className="flex flex-col gap-3" aria-label="Histórico de pedidos">
      {items.map((request) => (
        <li key={request.id}>
          <Card size="sm">
            <CardContent className="flex flex-col gap-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{request.organizationName}</span>
                <RequestStatusBadge status={request.status} />
              </div>
              <span className="text-muted-foreground">CNPJ {formatCnpj(request.cnpj)}</span>
              <span>{request.reason}</span>
              <span className="text-muted-foreground">
                Enviado em {formatDateTime(request.createdAt)}
                {request.decidedAt !== null &&
                  ` · Decidido em ${formatDateTime(request.decidedAt)}`}
              </span>
              {request.rejectionMessage !== null && (
                <span>
                  <strong>Mensagem do admin:</strong> {request.rejectionMessage}
                </span>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
