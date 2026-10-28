import type { OrganizerRequestStatus } from '@stubb/contracts';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS } from './format';

const VARIANT = {
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
} as const satisfies Record<OrganizerRequestStatus, 'secondary' | 'default' | 'destructive'>;

export function RequestStatusBadge({ status }: { status: OrganizerRequestStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}
