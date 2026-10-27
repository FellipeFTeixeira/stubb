import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDayMonth, formatDayMonthTime, formatMoney } from './format';

describe('format', () => {
  it('formata moeda em pt-BR com espaço não separável', () => {
    expect(formatMoney(123456)).toBe('R$ 1.234,56');
    expect(formatMoney(29)).toBe('R$ 0,29');
    expect(formatMoney(8000)).toBe('R$ 80,00');
  });

  it('formata data e hora no fuso informado', () => {
    expect(formatDateTime('2026-12-11T00:00:00.000Z', 'America/Manaus')).toBe('10/12/2026 20:00');
    expect(formatDateTime('2026-12-11T00:00:00.000Z', 'America/Sao_Paulo')).toBe(
      '10/12/2026 21:00',
    );
    expect(formatDayMonth('2026-12-11T00:00:00.000Z', 'America/Manaus')).toBe('10/12');
    expect(formatDayMonthTime('2026-12-11T00:00:00.000Z', 'America/Manaus')).toBe('10/12 20:00');
  });

  it('meia-noite usa hora 00 (ciclo h23)', () => {
    expect(formatDateTime('2026-12-11T03:00:00.000Z', 'America/Sao_Paulo')).toBe(
      '11/12/2026 00:00',
    );
  });
});
