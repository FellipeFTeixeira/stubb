import { describe, expect, it } from 'vitest';
import {
  eventDetailsSchema,
  httpsUrlSchema,
  priceCentsSchema,
  seatRowSchema,
  venueDetailsSchema,
  venueSectorInputSchema,
} from '../index.js';

const venue = {
  name: 'Teatro',
  address: 'Rua A, 1',
  city: 'Porto Alegre',
  state: 'RS',
  timeZone: 'America/Sao_Paulo',
};

const event = {
  title: 'Hamlet',
  description: 'Texto',
  category: 'theater',
  ageRating: '12',
  imageUrl: null,
};

function firstPath(r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): string {
  return r.error?.issues[0]?.path.join('.') ?? '';
}

describe('venueDetailsSchema', () => {
  it('apara espaços', () => {
    expect(venueDetailsSchema.parse({ ...venue, name: '  Teatro  ' }).name).toBe('Teatro');
  });

  it.each([
    ['name', 100],
    ['address', 200],
    ['city', 100],
  ] as const)('%s: 1 e %i aceitos, vazio e %i+1 rejeitados', (field, max) => {
    expect(venueDetailsSchema.safeParse({ ...venue, [field]: 'a' }).success).toBe(true);
    expect(venueDetailsSchema.safeParse({ ...venue, [field]: 'a'.repeat(max) }).success).toBe(true);
    const empty = venueDetailsSchema.safeParse({ ...venue, [field]: '   ' });
    expect(empty.success).toBe(false);
    expect(firstPath(empty)).toBe(field);
    expect(venueDetailsSchema.safeParse({ ...venue, [field]: 'a'.repeat(max + 1) }).success).toBe(
      false,
    );
  });

  it('rejeita UF e fuso fora da lista', () => {
    const uf = venueDetailsSchema.safeParse({ ...venue, state: 'XX' });
    expect(firstPath(uf)).toBe('state');
    expect(uf.error?.issues[0]?.message).toBe('Escolha uma UF');
    const tz = venueDetailsSchema.safeParse({ ...venue, timeZone: 'Europe/Paris' });
    expect(firstPath(tz)).toBe('timeZone');
    expect(tz.error?.issues[0]?.message).toBe('Escolha um fuso horário');
  });
});

describe('seatRowSchema', () => {
  it('rótulo a1 vira A1', () => {
    expect(seatRowSchema.parse({ label: ' a1 ', seats: 10 })).toEqual({ label: 'A1', seats: 10 });
  });
  it.each(['Á', '', 'ABCD', 'A-1'])('rejeita rótulo %j', (label) => {
    expect(seatRowSchema.safeParse({ label, seats: 10 }).success).toBe(false);
  });
  it.each([0, 101])('rejeita seats %i', (seats) => {
    expect(seatRowSchema.safeParse({ label: 'A', seats }).success).toBe(false);
  });
  it.each([1, 100])('aceita seats %i', (seats) => {
    expect(seatRowSchema.safeParse({ label: 'A', seats }).success).toBe(true);
  });
});

describe('venueSectorInputSchema', () => {
  it('pista: capacidade 1 e 50.000 aceitas; 0 e 50.001 rejeitadas', () => {
    const base = { name: 'Pista', kind: 'general_admission' as const };
    expect(venueSectorInputSchema.safeParse({ ...base, capacity: 1 }).success).toBe(true);
    expect(venueSectorInputSchema.safeParse({ ...base, capacity: 50000 }).success).toBe(true);
    expect(firstPath(venueSectorInputSchema.safeParse({ ...base, capacity: 0 }))).toBe('capacity');
    expect(venueSectorInputSchema.safeParse({ ...base, capacity: 50001 }).success).toBe(false);
  });

  it('nome: 50 aceito, 51 rejeitado', () => {
    const base = { kind: 'general_admission' as const, capacity: 10 };
    expect(venueSectorInputSchema.safeParse({ ...base, name: 'a'.repeat(50) }).success).toBe(true);
    expect(venueSectorInputSchema.safeParse({ ...base, name: 'a'.repeat(51) }).success).toBe(false);
  });

  it('marcado: rótulo repetido (já em maiúsculas) acusa rows.1.label', () => {
    const r = venueSectorInputSchema.safeParse({
      name: 'Plateia',
      kind: 'seated',
      rows: [
        { label: 'a', seats: 5 },
        { label: 'A', seats: 5 },
      ],
    });
    expect(r.success).toBe(false);
    expect(firstPath(r)).toBe('rows.1.label');
    expect(r.error?.issues[0]?.message).toBe('Rótulo de fila repetido');
  });

  it('marcado: 50 filas aceitas, 51 rejeitadas, 0 rejeitadas', () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `R${i}`, seats: 1 }));
    const base = { name: 'Plateia', kind: 'seated' as const };
    expect(venueSectorInputSchema.safeParse({ ...base, rows: rows(50) }).success).toBe(true);
    expect(venueSectorInputSchema.safeParse({ ...base, rows: rows(51) }).success).toBe(false);
    expect(venueSectorInputSchema.safeParse({ ...base, rows: [] }).success).toBe(false);
  });

  it('marcado válido devolve rótulos em maiúsculas', () => {
    const r = venueSectorInputSchema.parse({
      name: 'Plateia',
      kind: 'seated',
      rows: [{ label: 'b', seats: 3 }],
    });
    expect(r).toMatchObject({ rows: [{ label: 'B', seats: 3 }] });
  });
});

describe('httpsUrlSchema e eventDetailsSchema', () => {
  it('rejeita http://', () => {
    const r = httpsUrlSchema.safeParse('http://x.com/a.png');
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Use um endereço https://');
  });
  it('aceita https e apara', () => {
    expect(httpsUrlSchema.parse(' https://x.com/a.png ')).toBe('https://x.com/a.png');
  });
  it('2048 caracteres aceitos, 2049 rejeitados', () => {
    const url = (n: number) => 'https://x.com/' + 'a'.repeat(n - 14);
    expect(httpsUrlSchema.safeParse(url(2048)).success).toBe(true);
    expect(httpsUrlSchema.safeParse(url(2049)).success).toBe(false);
  });

  it('título 120/121 e descrição 5000/5001', () => {
    expect(eventDetailsSchema.safeParse({ ...event, title: 'a'.repeat(120) }).success).toBe(true);
    expect(eventDetailsSchema.safeParse({ ...event, title: 'a'.repeat(121) }).success).toBe(false);
    expect(eventDetailsSchema.safeParse({ ...event, title: '' }).success).toBe(false);
    expect(eventDetailsSchema.safeParse({ ...event, description: 'a'.repeat(5000) }).success).toBe(
      true,
    );
    expect(eventDetailsSchema.safeParse({ ...event, description: 'a'.repeat(5001) }).success).toBe(
      false,
    );
  });

  it('categoria e classificação fora da lista', () => {
    expect(firstPath(eventDetailsSchema.safeParse({ ...event, category: 'x' }))).toBe('category');
    expect(firstPath(eventDetailsSchema.safeParse({ ...event, ageRating: '15' }))).toBe(
      'ageRating',
    );
  });
});

describe('priceCentsSchema', () => {
  it.each([1, 10000000])('aceita %i', (v) => {
    expect(priceCentsSchema.safeParse(v).success).toBe(true);
  });
  it.each([0, 10000001, 1.5])('rejeita %s', (v) => {
    expect(priceCentsSchema.safeParse(v).success).toBe(false);
  });
});
