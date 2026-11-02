'use client';

import { Button, Card } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { vendorCheckInAction, vendorStatusAction } from './actions.js';

export interface VendorBookingDay {
  bookingId: string;
  eventId: string;
  eventName: string;
  startsAt: string | null;
  status: string;
  arrivedAt: string | null;
  items: { id: string; title: string; startsAt: string; durationMin: number; status: string }[];
}

/** Vendor event-day card (P12-T04): one-tap arrival plus the run items
 * assigned to this vendor, with status moves. */
export function VendorDayCard(props: { row: VendorBookingDay }) {
  const t = useTranslations('day');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const arrive = () => {
    setError(null);
    start(async () => {
      const result = await vendorCheckInAction({ bookingId: props.row.bookingId });
      if (!result.ok) setError('saveFailed');
    });
  };

  const move = (itemId: string, status: 'STARTED' | 'DONE' | 'SKIPPED' | 'PLANNED') => {
    setError(null);
    start(async () => {
      const result = await vendorStatusAction({ eventId: props.row.eventId, itemId, status });
      if (!result.ok) setError('saveFailed');
    });
  };

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{props.row.eventName}</span>
        <span className="text-muted text-sm">{props.row.status}</span>
        <span className="ml-auto" />
        {props.row.arrivedAt ? (
          <span className="text-sm">
            {t('arrivedAt', {
              at: new Date(props.row.arrivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            })}
          </span>
        ) : (
          <Button disabled={pending} onClick={arrive}>
            {t('arrive')}
          </Button>
        )}
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
      {props.row.items.length > 0 && (
        <ul className="flex flex-col gap-1 border-t pt-2 text-sm">
          {props.row.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2">
              <span className="text-muted font-mono">
                {new Date(item.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="font-medium">{item.title}</span>
              <span className="text-muted text-xs">{item.status}</span>
              <span className="ml-auto flex gap-1">
                {item.status !== 'DONE' && (
                  <Button variant="ghost" disabled={pending} onClick={() => move(item.id, 'DONE')}>
                    {t('done')}
                  </Button>
                )}
                {(item.status === 'PLANNED' || item.status === 'SKIPPED') && (
                  <Button variant="ghost" disabled={pending} onClick={() => move(item.id, 'STARTED')}>
                    {t('start')}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
