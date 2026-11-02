'use client';

import { DropdownMenu, StatusPill } from '@tiwa/ui';
import { Check, ChevronDown, CircleHelp, Clock, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { setGuestRsvpAction } from './actions.js';

type Rsvp = 'YES' | 'NO' | 'MAYBE' | 'NONE';

const TONE = { YES: 'success', NO: 'danger', MAYBE: 'warning', NONE: 'neutral' } as const;
const ICON = { YES: Check, NO: X, MAYBE: CircleHelp, NONE: Clock } as const;

/** The guest's reply as a pill the host can change (they answered by phone, in person…). */
export function RsvpControl({
  eventId,
  guestId,
  guestName,
  rsvp,
}: {
  eventId: string;
  guestId: string;
  guestName: string;
  rsvp: string;
}) {
  const t = useTranslations('events.guests');
  const [failed, setFailed] = React.useState(false);
  const router = useRouter();
  // Shows the new reply at once; falls back to the server value if the save fails.
  const [value, setValue] = React.useOptimistic(rsvp as Rsvp);
  const [pending, startTransition] = React.useTransition();

  function choose(next: Rsvp) {
    if (next === value) return;
    startTransition(async () => {
      setValue(next);
      const result = await setGuestRsvpAction({ eventId, guestId, rsvp: next });
      setFailed(!result.ok);
      if (result.ok) router.refresh();
    });
  }

  const Icon = ICON[value];
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <DropdownMenu
        align="end"
        label={t('rsvpChange.label', { name: guestName })}
        trigger={
          <button
            type="button"
            disabled={pending}
            aria-label={t('rsvpChange.trigger', { name: guestName, status: t(`rsvpLabels.${value}`) })}
            className="focus-visible:ring-brand rounded-full transition outline-none focus-visible:ring-2 disabled:opacity-60"
          >
            <StatusPill tone={TONE[value]}>
              <span className="inline-flex items-center gap-1">
                <Icon aria-hidden className="size-3.5" />
                {t(`rsvpLabels.${value}`)}
                <ChevronDown aria-hidden className="size-3.5 opacity-70" />
              </span>
            </StatusPill>
          </button>
        }
        items={(['YES', 'MAYBE', 'NO', 'NONE'] as const).map((key) => {
          const ItemIcon = ICON[key];
          return { label: t(`rsvpLabels.${key}`), icon: <ItemIcon className="size-4" />, onSelect: () => choose(key) };
        })}
      />
      {failed && (
        <span role="alert" className="text-danger text-xs">
          {t('rsvpChange.failed')}
        </span>
      )}
    </span>
  );
}
