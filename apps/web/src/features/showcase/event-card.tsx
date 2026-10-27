import { EVENT_CATEGORIES, type EventCard as EventCardData } from '@stubb/contracts';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { CATEGORY_LABELS } from '@/lib/catalog-labels';
import { formatDateTime, formatDayMonth, formatMoney } from '@/lib/format';

type Category = (typeof EVENT_CATEGORIES)[number];

function asCategory(value: string): Category {
  return (EVENT_CATEGORIES as readonly string[]).includes(value) ? (value as Category) : 'other';
}

function priceText(card: EventCardData): string {
  const { price, nextSession } = card;
  switch (price.kind) {
    case 'from':
      return `A partir de ${formatMoney(price.priceCents)}`;
    case 'sales_start':
      return `Vendas a partir de ${formatDayMonth(price.salesStartsAt, nextSession.timeZone)}`;
    case 'sales_ended':
      return 'Vendas encerradas';
  }
}

export function EventCard({ card }: { card: EventCardData }) {
  const category = asCategory(card.category);
  const placeholder = `/placeholders/${category}.svg`;
  const [imageFailed, setImageFailed] = useState(false);
  const src = card.imageUrl !== null && !imageFailed ? card.imageUrl : placeholder;
  const { nextSession, otherUpcomingSessionsCount } = card;

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <img
        src={src}
        alt={card.title}
        onError={() => setImageFailed(true)}
        className="aspect-video w-full object-cover"
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Badge variant="secondary">{CATEGORY_LABELS[category]}</Badge>
        <h2 className="text-lg font-semibold">
          <Link to={`/eventos/${card.id}`} className="hover:underline">
            {card.title}
          </Link>
        </h2>
        <p className="text-sm text-muted-foreground">
          {nextSession.venue.name} · {nextSession.venue.city}/{nextSession.venue.state}
        </p>
        <p className="text-sm">
          {formatDateTime(nextSession.startsAt, nextSession.timeZone)}
          {otherUpcomingSessionsCount > 0 && (
            <span className="ml-2 text-muted-foreground">+{otherUpcomingSessionsCount} datas</span>
          )}
        </p>
        <p className="mt-auto text-sm font-medium">{priceText(card)}</p>
      </div>
    </article>
  );
}
