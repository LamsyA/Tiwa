'use client';

import { Button, Card } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addMomentsToPortfolioAction } from './actions.js';

export interface MomentsSourceEvent {
  eventId: string;
  eventName: string;
  items: { id: string; thumbUrl: string | null }[];
}

/** Claim Moments photos for the portfolio (P14-T04): only from events with
 * a COMPLETED booking (verified), pending the host's approval. */
export function MomentsSourcePicker(props: { orgId: string; events: MomentsSourceEvent[]; pendingIds: string[] }) {
  const t = useTranslations('business');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  if (props.events.length === 0) return null;

  const add = () => {
    setError(null);
    start(async () => {
      const result = await addMomentsToPortfolioAction({ orgId: props.orgId, mediaItemIds: picked });
      if (!result.ok) setError('saveFailed');
      else {
        setPicked([]);
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <div className="flex flex-col gap-3 p-4">
        <h3 className="font-medium">{t('momentsSourceHeading')}</h3>
        <p className="text-muted text-sm">{t('momentsSourceBody')}</p>
        {error && <p className="text-danger text-sm">{error}</p>}
        {props.events.map((event) => (
          <div key={event.eventId} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{event.eventName}</p>
            <div className="flex flex-wrap gap-2">
              {event.items.map((item) =>
                props.pendingIds.includes(item.id) ? (
                  <span key={item.id} className="text-muted rounded-xl border px-2 py-1 text-xs">
                    {t('momentsPending')}
                  </span>
                ) : (
                  <label key={item.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={picked.includes(item.id)}
                      onChange={(event) =>
                        setPicked((prev) =>
                          event.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id),
                        )
                      }
                    />
                    {item.thumbUrl ? (
                      <img
                        src={item.thumbUrl}
                        alt={t('momentsPhotoAlt')}
                        width={64}
                        height={64}
                        className="rounded-lg object-cover"
                      />
                    ) : (
                      <span className="text-muted text-xs">{item.id.slice(0, 8)}</span>
                    )}
                  </label>
                ),
              )}
            </div>
          </div>
        ))}
        <div>
          <Button disabled={pending || picked.length === 0} onClick={add}>
            {t('momentsAdd')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
