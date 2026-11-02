'use client';

import { Button } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

/** Ticket picker island (kept tiny for the guest JS budget): qty steppers + link to register. */
export function TicketSelector(props: {
  slug: string;
  currency: string;
  types: {
    id: string;
    name: string;
    description: string | null;
    priceMinor: string;
    available: number;
    maxPerOrder: number;
    onSale: boolean;
  }[];
}) {
  const t = useTranslations('publicEvent');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [, start] = useTransition();
  const total = props.types.reduce((sum, row) => sum + (qty[row.id] ?? 0), 0);
  const params = new URLSearchParams();
  for (const row of props.types) {
    const count = qty[row.id] ?? 0;
    if (count > 0) params.append('t', `${row.id}:${count}`);
  }
  const bump = (id: string, delta: number, max: number) => {
    setQty((prev) => {
      const next = Math.max(0, Math.min(max, (prev[id] ?? 0) + delta));
      return { ...prev, [id]: next };
    });
  };
  return (
    <div className="flex flex-col gap-3">
      {props.types.map((row) => {
        const max = Math.min(row.maxPerOrder, row.available);
        const count = qty[row.id] ?? 0;
        return (
          <div key={row.id} className="flex items-center gap-3 border-t pt-3 text-sm first:border-t-0 first:pt-0">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{row.name}</p>
              <p className="text-muted">
                {row.priceMinor === '0' ? t('free') : `${row.priceMinor} ${props.currency}`} ·{' '}
                {row.onSale ? t('left', { count: row.available }) : t('notOnSale')}
              </p>
            </div>
            <div className="flex items-center gap-2" role="group" aria-label={row.name}>
              <Button
                variant="secondary"
                disabled={count <= 0}
                onClick={() => bump(row.id, -1, max)}
                aria-label={`− ${row.name}`}
              >
                −
              </Button>
              <span className="w-6 text-center font-medium" aria-live="polite">
                {count}
              </span>
              <Button
                variant="secondary"
                disabled={!row.onSale || count >= max}
                onClick={() => bump(row.id, 1, max)}
                aria-label={`+ ${row.name}`}
              >
                +
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        disabled={total === 0}
        onClick={() =>
          start(() => {
            window.location.href = `/e/${props.slug}/register?${params.toString()}`;
          })
        }
      >
        {t('buyTickets')}
        {total > 0 ? ` (${total})` : ''}
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          const url = window.location.href;
          if (navigator.share) void navigator.share({ url }).catch(() => undefined);
          else void navigator.clipboard?.writeText(url).catch(() => undefined);
        }}
      >
        {t('share')}
      </Button>
    </div>
  );
}
