// Derived state (RN-36, RN-39, RN-40, RN-41, I-1): everything that depends on the clock is
// computed at read time from `now`, never stored. Pure functions; `now` is always a parameter.

export interface BatchLike {
  priceCents: number;
  endsAt: Date | null;
  position: number;
}

export interface SectorLike<B extends BatchLike = BatchLike> {
  batches: B[];
}

export interface SessionLike {
  /** Absent means published (the listing keeps only published sessions). */
  status?: 'draft' | 'published';
  startsAt: Date;
  salesStartsAt: Date;
}

export type SectorSales<B> =
  { status: 'open'; batch: B } | { status: 'upcoming'; salesStartsAt: Date } | { status: 'ended' };

export type BatchBadge = 'ended' | 'current' | 'upcoming';

export type CardPrice =
  | { kind: 'from'; priceCents: number }
  | { kind: 'sales_start'; salesStartsAt: Date }
  | { kind: 'sales_ended' };

const isPublished = (session: SessionLike): boolean =>
  (session.status ?? 'published') === 'published';

/** Published and salesStartsAt <= now < startsAt. */
export function salesStarted(session: SessionLike, now: Date): boolean {
  return (
    isPublished(session) &&
    session.salesStartsAt.getTime() <= now.getTime() &&
    now.getTime() < session.startsAt.getTime()
  );
}

/** RN-29: the first batch, in order, that has not ended; only after sales started. */
export function currentBatch<B extends BatchLike>(
  session: SessionLike,
  sector: SectorLike<B>,
  now: Date,
): B | null {
  if (!salesStarted(session, now)) return null;
  const ordered = [...sector.batches].sort((a, b) => a.position - b.position);
  return ordered.find((b) => b.endsAt === null || b.endsAt.getTime() > now.getTime()) ?? null;
}

export function sessionEnded(session: SessionLike, now: Date): boolean {
  return now.getTime() >= session.startsAt.getTime();
}

/** RN-40: sales started and at least one sector has a current batch. */
export function sessionSalesOpen(
  session: SessionLike,
  sectors: ReadonlyArray<SectorLike>,
  now: Date,
): boolean {
  return salesStarted(session, now) && sectors.some((s) => currentBatch(session, s, now) !== null);
}

/** RN-41: per-sector sales state shown on the public page. */
export function sectorSales<B extends BatchLike>(
  session: SessionLike,
  sector: SectorLike<B>,
  now: Date,
): SectorSales<B> {
  const batch = currentBatch(session, sector, now);
  if (batch) return { status: 'open', batch };
  if (now.getTime() < session.salesStartsAt.getTime()) {
    return { status: 'upcoming', salesStartsAt: session.salesStartsAt };
  }
  return { status: 'ended' };
}

/**
 * I-1: current = the RN-29 current batch; ended = endsAt passed or the session already
 * started; upcoming = the rest. A draft session never has a current batch.
 */
export function batchBadge<B extends BatchLike>(
  session: SessionLike,
  sector: SectorLike<B>,
  batch: B,
  now: Date,
): BatchBadge {
  const current = currentBatch(session, sector, now);
  if (current !== null && current.position === batch.position) return 'current';
  if (sessionEnded(session, now)) return 'ended';
  if (batch.endsAt !== null && batch.endsAt.getTime() <= now.getTime()) return 'ended';
  return 'upcoming';
}

/** RN-36: has a published session and all published ones already started. */
export function eventEnded(sessions: ReadonlyArray<SessionLike>, now: Date): boolean {
  const published = sessions.filter(isPublished);
  return published.length > 0 && published.every((s) => sessionEnded(s, now));
}

export interface ListingSessionLike<B extends BatchLike = BatchLike> extends SessionLike {
  venue: unknown;
  sectors: Array<SectorLike<B>>;
}

/** RN-37/RN-38: published, not started, with a known venue. */
export function visibleSessions<S extends ListingSessionLike>(sessions: S[], now: Date): S[] {
  return sessions.filter(
    (s) => isPublished(s) && s.startsAt.getTime() > now.getTime() && s.venue !== null,
  );
}

/** RN-39: card price over the visible sessions. */
export function cardPrice(sessions: ListingSessionLike[], now: Date): CardPrice {
  const visible = visibleSessions(sessions, now);
  const prices: number[] = [];
  for (const session of visible) {
    for (const sector of session.sectors) {
      const batch = currentBatch(session, sector, now);
      if (batch) prices.push(batch.priceCents);
    }
  }
  if (prices.length > 0) return { kind: 'from', priceCents: Math.min(...prices) };
  const future = visible.map((s) => s.salesStartsAt.getTime()).filter((t) => t > now.getTime());
  if (future.length > 0)
    return { kind: 'sales_start', salesStartsAt: new Date(Math.min(...future)) };
  return { kind: 'sales_ended' };
}
