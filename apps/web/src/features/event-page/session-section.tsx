import type { PublicEventView } from '@stubb/contracts';
import { SECTOR_KIND_LABELS } from '@/lib/catalog-labels';
import { formatDateTime, formatDayMonthTime, formatMoney } from '@/lib/format';

type Session = PublicEventView['sessions'][number];
type Sector = Session['sectors'][number];

function salesText(sector: Sector, timeZone: string): string {
  const { sales } = sector;
  switch (sales.status) {
    case 'open':
      return `${sales.batch.name}: ${formatMoney(sales.batch.priceCents)}`;
    case 'upcoming':
      return `Vendas a partir de ${formatDayMonthTime(sales.salesStartsAt, timeZone)}`;
    case 'ended':
      return 'Vendas encerradas';
  }
}

export function SessionSection({ session }: { session: Session }) {
  const headingId = `session-${session.id}`;
  const { venue } = session;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 id={headingId} className="text-lg font-semibold">
        Sessão de {formatDateTime(session.startsAt, session.timeZone)}
      </h2>
      <p className="text-sm">
        {venue.name} · {venue.address} · {venue.city}/{venue.state}
      </p>
      {session.ended ? (
        <p className="text-sm font-medium text-muted-foreground">Sessão encerrada</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {session.sectors.map((sector) => (
            <li key={sector.id} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{sector.name}</span>
              <span className="text-muted-foreground">({SECTOR_KIND_LABELS[sector.kind]})</span>
              <span>{salesText(sector, session.timeZone)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
