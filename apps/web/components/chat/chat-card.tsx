'use client';

import { MoneyText, cn } from '@tiwa/ui';
import {
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  FileText,
  MessageSquareWarning,
  Receipt,
  RefreshCw,
  XCircle,
} from 'lucide-react';
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
  const Icon =
    card.type === 'booking'
      ? CalendarCheck
      : card.type === 'change'
        ? RefreshCw
        : card.type === 'site_visit'
          ? CalendarCheck
          : FileText;
  const total =
    card.totalMinor !== undefined && card.currency ? (
      <MoneyText value={card.totalMinor} currency={card.currency} />
    ) : null;
  const diff =
    card.diffMinor !== undefined && card.currency ? (
      <MoneyText value={card.diffMinor} currency={card.currency} />
    ) : null;
  return (
    <div className="tiwa-bubble-in flex w-full max-w-xs items-start gap-3 rounded-2xl px-3.5 py-3 text-sm">
      <span className="bg-brand-soft text-brand-strong grid size-9 shrink-0 place-items-center rounded-xl">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {card.type === 'quote' && t('cardQuote', { vendor: card.vendorName ?? '' })}
          {card.type === 'booking' &&
            (card.category ? t('cardBooking', { category: card.category }) : t('cardBookingPlain'))}
          {card.type === 'change' && t('cardChange', { version: card.version ?? 0 })}
          {card.type === 'site_visit' && t('cardVisit')}
        </p>
        {total && <p className="text-muted font-medium tabular-nums">{total}</p>}
        {diff && card.type === 'change' && <p className="text-muted tabular-nums">±{diff}</p>}
        {card.type === 'site_visit' && card.date && (
          <p className="text-muted">{new Date(card.date).toLocaleString()}</p>
        )}
        {/* D-X101: the host opens the proposal from the chat it grew out of. */}
        {card.href && !mine && (
          <a
            href={card.href}
            className="bg-brand-strong mt-2 inline-flex rounded-full px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            {t('cardReview')}
          </a>
        )}
      </div>
    </div>
  );
}
