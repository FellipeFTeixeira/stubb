import { describe, expect, it } from 'vitest';
import {
  type BatchLike,
  batchBadge,
  cardPrice,
  currentBatch,
  eventEnded,
  sectorSales,
  sessionEnded,
  sessionSalesOpen,
  type ListingSessionLike,
  type SessionLike,
} from './derived-state.js';

const NOW = new Date('2026-11-01T12:00:00.000Z');
const at = (iso: string): Date => new Date(iso);

const published: SessionLike = {
  status: 'published',
  salesStartsAt: at('2026-10-01T00:00:00.000Z'),
  startsAt: at('2026-12-01T00:00:00.000Z'),
};

const sector = (...batches: Array<[number, string | null]>) => ({
  batches: batches.map(([priceCents, endsAt], position) => ({
    priceCents,
    endsAt: endsAt === null ? null : at(endsAt),
    position,
  })),
});

describe('currentBatch', () => {
  it('is null for a draft session even with an open batch', () => {
    const draft: SessionLike = { ...published, status: 'draft' };
    expect(currentBatch(draft, sector([1000, null]), NOW)).toBeNull();
  });

  it('turns to batch 2 when batch 1 endsAt passed', () => {
    const s = sector([1000, '2026-10-20T00:00:00.000Z'], [2000, null]);
    expect(currentBatch(published, s, NOW)?.priceCents).toBe(2000);
  });

  it('keeps the first batch while its endsAt is in the future', () => {
    const s = sector([1000, '2026-11-02T00:00:00.000Z'], [2000, null]);
    expect(currentBatch(published, s, NOW)?.priceCents).toBe(1000);
  });

  it('keeps the last unbounded batch current until the session starts', () => {
    const s = sector([1000, '2026-10-20T00:00:00.000Z'], [2000, null]);
    expect(currentBatch(published, s, at('2026-11-30T23:59:59.000Z'))?.priceCents).toBe(2000);
    expect(currentBatch(published, s, at('2026-12-01T00:00:00.000Z'))).toBeNull();
  });

  it('is null when every batch has ended', () => {
    const s = sector([1000, '2026-10-20T00:00:00.000Z'], [2000, '2026-10-25T00:00:00.000Z']);
    expect(currentBatch(published, s, NOW)).toBeNull();
  });

  it('is null before salesStartsAt', () => {
    const future = { ...published, salesStartsAt: at('2026-11-10T00:00:00.000Z') };
    expect(currentBatch(future, sector([1000, null]), NOW)).toBeNull();
  });
});

describe('sessionEnded / sessionSalesOpen', () => {
  it('ends exactly at startsAt', () => {
    expect(sessionEnded(published, at('2026-11-30T23:59:59.999Z'))).toBe(false);
    expect(sessionEnded(published, at('2026-12-01T00:00:00.000Z'))).toBe(true);
  });

  it('needs a current batch in some sector', () => {
    const open = sector([1000, null]);
    const dead = sector([1000, '2026-10-20T00:00:00.000Z']);
    expect(sessionSalesOpen(published, [dead, open], NOW)).toBe(true);
    expect(sessionSalesOpen(published, [dead], NOW)).toBe(false);
  });

  it('is closed in draft', () => {
    expect(sessionSalesOpen({ ...published, status: 'draft' }, [sector([1, null])], NOW)).toBe(
      false,
    );
  });
});

describe('sectorSales', () => {
  it('is open with the current batch', () => {
    const result = sectorSales(published, sector([1000, null]), NOW);
    expect(result.status).toBe('open');
    if (result.status === 'open') expect(result.batch.priceCents).toBe(1000);
  });

  it('is upcoming before salesStartsAt', () => {
    const future = { ...published, salesStartsAt: at('2026-11-10T00:00:00.000Z') };
    expect(sectorSales(future, sector([1000, null]), NOW)).toEqual({
      status: 'upcoming',
      salesStartsAt: future.salesStartsAt,
    });
  });

  it('is ended when every batch is over', () => {
    const s = sector([1000, '2026-10-20T00:00:00.000Z']);
    expect(sectorSales(published, s, NOW)).toEqual({ status: 'ended' });
  });
});

describe('batchBadge (I-1)', () => {
  const s = sector(
    [1000, '2026-10-20T00:00:00.000Z'],
    [2000, '2026-11-15T00:00:00.000Z'],
    [3000, null],
  );
  const [b1, b2, b3] = s.batches as [BatchLike, BatchLike, BatchLike];

  it('marks ended, current and upcoming', () => {
    expect(batchBadge(published, s, b1, NOW)).toBe('ended');
    expect(batchBadge(published, s, b2, NOW)).toBe('current');
    expect(batchBadge(published, s, b3, NOW)).toBe('upcoming');
  });

  it('has no current batch in a draft session', () => {
    const draft: SessionLike = { ...published, status: 'draft' };
    expect(batchBadge(draft, s, b2, NOW)).toBe('upcoming');
    expect(batchBadge(draft, s, b1, NOW)).toBe('ended');
  });

  it('ends every batch once the session started', () => {
    const later = at('2026-12-02T00:00:00.000Z');
    expect([b1, b2, b3].map((b) => batchBadge(published, s, b, later))).toEqual([
      'ended',
      'ended',
      'ended',
    ]);
  });

  it('keeps batches upcoming before salesStartsAt', () => {
    const future = { ...published, salesStartsAt: at('2026-11-10T00:00:00.000Z') };
    expect(batchBadge(future, s, b2, NOW)).toBe('upcoming');
  });
});

describe('eventEnded', () => {
  it('needs a published session and all of them started', () => {
    const past = { ...published, startsAt: at('2026-10-30T00:00:00.000Z') };
    expect(eventEnded([past], NOW)).toBe(true);
    expect(eventEnded([past, published], NOW)).toBe(false);
    expect(eventEnded([], NOW)).toBe(false);
    expect(eventEnded([{ ...past, status: 'draft' }], NOW)).toBe(false);
  });
});

describe('cardPrice (RN-39)', () => {
  const venue = { name: 'V' };
  const session = (overrides: Partial<ListingSessionLike>): ListingSessionLike => ({
    ...published,
    venue,
    sectors: [],
    ...overrides,
  });

  it('is the lowest current price across sessions and sectors', () => {
    const result = cardPrice(
      [
        session({ sectors: [sector([5000, null]), sector([3000, null])] }),
        session({ sectors: [sector([2000, null])] }),
      ],
      NOW,
    );
    expect(result).toEqual({ kind: 'from', priceCents: 2000 });
  });

  it('ignores ended, venue-less and started sessions', () => {
    const result = cardPrice(
      [
        session({ venue: null, sectors: [sector([100, null])] }),
        session({ startsAt: at('2026-10-30T00:00:00.000Z'), sectors: [sector([200, null])] }),
        session({ sectors: [sector([4000, null])] }),
      ],
      NOW,
    );
    expect(result).toEqual({ kind: 'from', priceCents: 4000 });
  });

  it('shows the earliest future salesStartsAt when no batch is current', () => {
    const result = cardPrice(
      [
        session({ salesStartsAt: at('2026-11-20T00:00:00.000Z'), sectors: [sector([1, null])] }),
        session({ salesStartsAt: at('2026-11-10T00:00:00.000Z'), sectors: [sector([1, null])] }),
      ],
      NOW,
    );
    expect(result).toEqual({ kind: 'sales_start', salesStartsAt: at('2026-11-10T00:00:00.000Z') });
  });

  it('is sales_ended when sales already finished everywhere', () => {
    const result = cardPrice(
      [session({ sectors: [sector([1000, '2026-10-20T00:00:00.000Z'])] })],
      NOW,
    );
    expect(result).toEqual({ kind: 'sales_ended' });
  });
});
