import { zonedParts } from '@stubb/contracts';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatMoney(cents: number): string {
  return money.format(cents / 100);
}

const two = (n: number) => String(n).padStart(2, '0');

function parts(iso: string, timeZone: string) {
  const p = zonedParts(iso, timeZone);
  return { day: two(p.day), month: two(p.month), time: `${two(p.hour)}:${two(p.minute)}`, p };
}

export function formatDateTime(iso: string, timeZone: string): string {
  const { day, month, time, p } = parts(iso, timeZone);
  return `${day}/${month}/${p.year} ${time}`;
}

export function formatDayMonth(iso: string, timeZone: string): string {
  const { day, month } = parts(iso, timeZone);
  return `${day}/${month}`;
}

export function formatDayMonthTime(iso: string, timeZone: string): string {
  const { day, month, time } = parts(iso, timeZone);
  return `${day}/${month} ${time}`;
}
