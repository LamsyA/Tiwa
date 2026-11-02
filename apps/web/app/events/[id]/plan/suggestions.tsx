'use client';

import { Banner, Button, Checkbox, ResponsiveDialog, cn } from '@tiwa/ui';
import { ListChecks, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { applySuggestionsAction, listSuggestionsAction } from './actions.js';

interface Suggestion {
  key: string;
  title: string;
  timeframe: string;
  added: boolean;
}

/**
 * Template checklist as an opt-in (D-X30): the host ticks what fits their
 * event; nothing is added until they choose. `prominent` renders the empty-plan card.
 */
export function SuggestionsSheet({ eventId, prominent }: { eventId: string; prominent: boolean }) {
  const t = useTranslations('events.plan');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Suggestion[] | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  async function openSheet() {
    setOpen(true);
    setError(null);
    const result = await listSuggestionsAction({ eventId });
    if (!result.ok) return setError(t('errors.generic'));
    setItems(result.data);
    setPicked(new Set(result.data.filter((row) => !row.added).map((row) => row.key)));
  }

  async function add() {
    setWorking(true);
    const result = await applySuggestionsAction({ eventId, keys: [...picked] });
    setWorking(false);
    if (!result.ok) return setError(t('errors.generic'));
    setOpen(false);
    router.refresh();
  }

  const trigger = prominent ? (
    <div className="border-border/80 bg-bg flex flex-col items-center gap-4 rounded-3xl border px-6 py-12 text-center">
      <span className="bg-brand-soft text-brand-strong grid size-14 place-items-center rounded-2xl">
        <ListChecks className="size-6" aria-hidden />
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="font-display text-2xl font-bold tracking-tight">{t('emptyTitle')}</h2>
        <p className="text-muted">{t('emptyBody')}</p>
      </div>
      <Button variant="secondary" onClick={() => void openSheet()}>
        <Sparkles className="size-4" aria-hidden />
        {t('pickSuggestions')}
      </Button>
    </div>
  ) : (
    <Button variant="secondary" size="sm" onClick={() => void openSheet()}>
      <Sparkles className="size-4" aria-hidden />
      {t('pickSuggestions')}
    </Button>
  );

  return (
    <>
      {trigger}
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t('suggestionsTitle')}
        description={t('suggestionsBody')}
      >
        <div className="flex flex-col gap-3">
          {error && <Banner tone="danger">{error}</Banner>}
          {items === null ? (
            <p className="text-muted text-sm">{t('loading')}</p>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <button
                  type="button"
                  className="text-brand-strong font-medium"
                  onClick={() => setPicked(new Set(items.filter((row) => !row.added).map((row) => row.key)))}
                >
                  {t('selectAll')}
                </button>
                <button type="button" className="text-muted font-medium" onClick={() => setPicked(new Set())}>
                  {t('selectNone')}
                </button>
              </div>
              <ul className="border-border/80 divide-border/80 max-h-[50vh] divide-y overflow-y-auto rounded-2xl border">
                {items.map((row) => (
                  <li key={row.key}>
                    <label className={cn('flex items-center gap-3 px-4 py-3 text-[15px]', row.added && 'opacity-50')}>
                      <Checkbox
                        disabled={row.added}
                        checked={row.added || picked.has(row.key)}
                        onCheckedChange={(checked) =>
                          setPicked((current) => {
                            const next = new Set(current);
                            if (checked === true) next.add(row.key);
                            else next.delete(row.key);
                            return next;
                          })
                        }
                      />
                      <span className="flex-1">{row.title}</span>
                      <span className="text-muted text-xs">
                        {row.added ? t('alreadyAdded') : t(`timeframes.${row.timeframe}`)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <Button disabled={working || picked.size === 0} onClick={() => void add()}>
                {t('addSelected', { count: picked.size })}
              </Button>
            </>
          )}
        </div>
      </ResponsiveDialog>
    </>
  );
}
