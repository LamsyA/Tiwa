'use client';

import { Banner, Button, ResponsiveDialog, cn } from '@tiwa/ui';
import { ArrowRight, CalendarPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { startClientEventAction } from '../actions.js';

/** D-X47: turn a client into their event — pick a type, land in the wizard. */
export function StartClientEvent({
  clientId,
  clientName,
  types,
}: {
  clientId: string;
  clientName: string;
  types: { key: string; label: string; blurb: string }[];
}) {
  const t = useTranslations('planner.startEvent');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState(false);

  async function onStart() {
    if (!type) return;
    setWorking(true);
    setError(false);
    const result = await startClientEventAction({ clientId, type });
    if (!result.ok) {
      setWorking(false);
      setError(true);
      return;
    }
    router.push(`/events/new?id=${result.data.eventId}&step=basics`);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="rounded-full">
        <CalendarPlus aria-hidden className="size-4" />
        {t('button')}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t('title', { name: clientName })}>
        <div className="flex flex-col gap-4">
          <p className="text-muted text-sm">{t('body')}</p>
          {error && <Banner tone="danger">{t('error')}</Banner>}
          <ul className="grid max-h-[50vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {types.map((option) => (
              <li key={option.key}>
                <button
                  type="button"
                  aria-pressed={type === option.key}
                  onClick={() => setType(option.key)}
                  className={cn(
                    'flex h-full w-full flex-col gap-0.5 rounded-2xl border p-3 text-left transition',
                    type === option.key
                      ? 'border-brand bg-brand-soft/60 ring-brand/30 ring-2'
                      : 'border-border/70 hover:border-brand/40',
                  )}
                >
                  <span className="text-sm font-semibold">{option.label}</span>
                  <span className="text-muted line-clamp-2 text-xs">{option.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
          <Button onClick={() => void onStart()} disabled={!type || working}>
            {working ? t('working') : t('continue')}
            <ArrowRight aria-hidden className="size-4" />
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}
