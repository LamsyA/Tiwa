'use client';

import { MoneyText } from '@tiwa/ui';
import { useTranslations } from 'next-intl';

export interface ChatCardData {
  type: string;
  id: string;
  vendorName?: string;
  category?: string;
  totalMinor?: string;
  currency?: string;
  version?: number;
  diffMinor?: string;
  date?: string;
}

/** Booking timeline card (P7-T12): a quote, booking, change or visit rendered inline. */
export function ChatCard({ card }: { card: ChatCardData }) {
  const t = useTranslations('inbox');
  const total =
    card.totalMinor !== undefined && card.currency ? (
      <MoneyText value={card.totalMinor} currency={card.currency} />
    ) : null;
  const diff =
    card.diffMinor !== undefined && card.currency ? (
      <MoneyText value={card.diffMinor} currency={card.currency} />
    ) : null;
  return (
    <div className="border-border bg-surface-2 flex max-w-xs flex-col gap-0.5 rounded-2xl border px-3 py-2 text-sm">
      <p className="font-medium">
        {card.type === 'quote' && t('cardQuote', { vendor: card.vendorName ?? '' })}
        {card.type === 'booking' && t('cardBooking', { category: card.category ?? '' })}
        {card.type === 'change' && t('cardChange', { version: card.version ?? 0 })}
        {card.type === 'site_visit' && t('cardVisit')}
      </p>
      {total && <p className="text-muted">{total}</p>}
      {diff && card.type === 'change' && <p className="text-muted">±{diff}</p>}
      {card.type === 'site_visit' && card.date && (
        <p className="text-muted">{new Date(card.date).toLocaleString()}</p>
      )}
    </div>
  );
}
