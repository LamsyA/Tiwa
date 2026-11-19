'use client';

import { MoneyText, cn } from '@tiwa/ui';
import { AlertCircle, CheckCircle2, MessageSquareWarning, Receipt, XCircle } from 'lucide-react';
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
  href?: string;
  decision?: string;
  subject?: string;
  label?: string;
  note?: string;
}

const DECISION_LOOK: Record<string, { icon: typeof CheckCircle2; tone: string }> = {
  approved: { icon: CheckCircle2, tone: 'border-success/30 bg-success/[0.07] text-success' },
  received: { icon: CheckCircle2, tone: 'border-success/30 bg-success/[0.07] text-success' },
  declined: { icon: XCircle, tone: 'border-danger/30 bg-danger/[0.06] text-danger' },
  not_received: { icon: AlertCircle, tone: 'border-danger/30 bg-danger/[0.06] text-danger' },
  changes: {
    icon: MessageSquareWarning,
    tone: 'border-amber-500/30 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300',
  },
  recorded: { icon: Receipt, tone: 'border-brand/30 bg-brand-soft/50 text-brand-strong' },
};

/** D-X107: an approval or rejection between the two sides, shown in their chat. */
function DecisionCard({ card }: { card: ChatCardData }) {
  const t = useTranslations('inbox.decision');
  const look = DECISION_LOOK[card.decision ?? ''] ?? DECISION_LOOK.recorded!;
  const Icon = look.icon;
  const key = `${card.decision}.${card.subject}`;
  const title = t.has(key)
    ? t(key as 'approved.proposal', {
        version: card.version ?? 0,
        vendor: card.vendorName ?? '',
        label: card.label ?? '',
      })
    : '';
  return (
    <div className={cn('flex w-full max-w-sm items-start gap-3 rounded-2xl border px-3.5 py-3 text-sm', look.tone)}>
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="text-text min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {card.totalMinor !== undefined && card.currency && (
          <p className="text-muted tabular-nums">
            <MoneyText value={card.totalMinor} currency={card.currency} />
          </p>
        )}
        {card.diffMinor !== undefined && card.currency && card.diffMinor !== '0' && (
          <p className="text-muted tabular-nums">
            {card.diffMinor.startsWith('-') ? '' : '+'}
            <MoneyText value={card.diffMinor} currency={card.currency} />
          </p>
        )}
        {card.note && <p className="text-muted mt-1 line-clamp-3 italic">“{card.note}”</p>}
      </div>
    </div>
  );
}

/** Booking timeline card (P7-T12): a quote, booking, change or visit rendered inline. */
export function ChatCard({ card, mine = false }: { card: ChatCardData; mine?: boolean }) {
  const t = useTranslations('inbox');
  if (card.type === 'decision') return <DecisionCard card={card} />;
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
      {card.type === 'site_visit' && card.date && <p className="text-muted">{new Date(card.date).toLocaleString()}</p>}
      {/* D-X101: the host opens the proposal from the chat it grew out of. */}
      {card.href && !mine && (
        <a href={card.href} className="text-brand-strong mt-1 text-sm font-semibold hover:underline">
          {t('cardReview')}
        </a>
      )}
    </div>
  );
}
