import {
  RejectOrganizerRequestRequestSchema,
  type AdminOrganizerRequestView,
} from '@stubb/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { describeCommandError } from '@/api/command-errors';
import { ApiError, approveOrganizerRequest, rejectOrganizerRequest } from '@/api/identity';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ALREADY_DECIDED, formatCnpj, formatDateTime } from './format';
import { RequestStatusBadge } from './request-status-badge';
import { useIdentityCommand } from './use-identity-command';

// Prefixo de `identityKeys.adminOrganizerRequests(params)`: decidir um pedido muda todas as abas.
const ADMIN_LIST_KEY = ['identity', 'admin-organizer-requests'] as const;

type Decision = { kind: 'approve' } | { kind: 'reject'; message: string | undefined };

function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (message: string | undefined) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [text, setText] = useState('');
  const parsed = RejectOrganizerRequestRequestSchema.safeParse({ message: text });
  const invalid = parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Mensagem inválida');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recusar pedido</DialogTitle>
          <DialogDescription>
            A mensagem é opcional e aparece para o solicitante em Minha conta.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="reject-message" className="text-sm font-medium">
          Mensagem (opcional)
        </label>
        <Textarea
          id="reject-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={500}
          rows={4}
          aria-invalid={invalid !== null ? true : undefined}
        />
        {invalid !== null && <p className="text-sm text-destructive">{invalid}</p>}
        {error !== null && <Alert variant="destructive">{error}</Alert>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending || invalid !== null}
            onClick={() => onConfirm(parsed.success ? parsed.data.message : undefined)}
          >
            Confirmar recusa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminRequestCard({ request }: { request: AdminOrganizerRequestView }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Uma Idempotency-Key por ação (aprovar; recusar com aquela mensagem).
  const { run, isPending } = useIdentityCommand((decision: Decision, key: string) =>
    decision.kind === 'approve'
      ? approveOrganizerRequest(request.id, key)
      : rejectOrganizerRequest(request.id, decision.message, key),
  );

  const decide = (decision: Decision) => {
    setError(null);
    run(decision, {
      onSuccess: () => {
        setRejecting(false);
        void queryClient.invalidateQueries({ queryKey: ADMIN_LIST_KEY });
      },
      onError: (e) => {
        if (e instanceof ApiError && e.code === 'ORGANIZER_REQUEST_NOT_PENDING') {
          setError(ALREADY_DECIDED);
          void queryClient.invalidateQueries({ queryKey: ADMIN_LIST_KEY });
          return;
        }
        setError(describeCommandError(e));
      },
    });
  };

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">{request.requester.fullName}</span>
          <RequestStatusBadge status={request.status} />
        </div>
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">E-mail</dt>
          <dd>{request.requester.email}</dd>
          <dt className="text-muted-foreground">Organização</dt>
          <dd>{request.organizationName}</dd>
          <dt className="text-muted-foreground">CNPJ</dt>
          <dd>{formatCnpj(request.cnpj)}</dd>
          <dt className="text-muted-foreground">Motivo</dt>
          <dd>{request.reason}</dd>
          <dt className="text-muted-foreground">Enviado em</dt>
          <dd>{formatDateTime(request.createdAt)}</dd>
          {request.decidedAt !== null && (
            <>
              <dt className="text-muted-foreground">Decidido em</dt>
              <dd>{formatDateTime(request.decidedAt)}</dd>
            </>
          )}
          {request.rejectionMessage !== null && (
            <>
              <dt className="text-muted-foreground">Mensagem</dt>
              <dd>{request.rejectionMessage}</dd>
            </>
          )}
        </dl>
        {request.status === 'pending' && (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={() => decide({ kind: 'approve' })}
            >
              Aprovar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                setError(null);
                setRejecting(true);
              }}
            >
              Recusar
            </Button>
          </div>
        )}
        {error !== null && !rejecting && <Alert variant="destructive">{error}</Alert>}
      </CardContent>
      {rejecting && (
        <RejectDialog
          open
          onOpenChange={setRejecting}
          onConfirm={(message) => decide({ kind: 'reject', message })}
          isPending={isPending}
          error={error}
        />
      )}
    </Card>
  );
}
