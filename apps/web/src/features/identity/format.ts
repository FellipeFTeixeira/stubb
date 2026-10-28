import type { OrganizerRequestStatus, UserRole } from '@stubb/contracts';

export const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Cliente',
  organizer: 'Produtor',
  admin: 'Admin',
  gate_staff: 'Portaria',
};

export const STATUS_LABELS: Record<OrganizerRequestStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Recusado',
};

// 14 caracteres (numérico ou alfanumérico) no formato XX.XXX.XXX/XXXX-XX.
export function formatCnpj(value: string): string {
  if (value.length !== 14) return value;
  return `${value.slice(0, 2)}.${value.slice(2, 5)}.${value.slice(5, 8)}/${value.slice(8, 12)}-${value.slice(12)}`;
}

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

// A resposta do servidor é sempre a mesma (não revela se o e-mail existe), então o texto também.
export const RESEND_DONE = 'Se a conta existir e não estiver confirmada, enviamos um novo link.';

export const ALREADY_DECIDED = 'Este pedido já foi decidido';
