import type { EventReadiness } from '@tiwa/core';
import { cn } from '@tiwa/ui';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

/** Guided setup (D-X45): the next things to do, ticked from real data. */
export async function ReadinessCard({ eventId, readiness }: { eventId: string; readiness: EventReadiness }) {
  const t = await getTranslations('events.readiness');
  const next = readiness.steps.find((step) => !step.done);
  const percent = Math.round((readiness.done / readiness.total) * 100);
  return (
    <section
      aria-labelledby="readiness-heading"
      className="border-border/70 bg-surface relative overflow-hidden rounded-3xl border p-5 shadow-[var(--shadow-1)] sm:p-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-[var(--brand)]/10 blur-3xl"
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-brand-strong inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <Sparkles aria-hidden className="size-3.5" />
            {t('eyebrow')}
          </p>
          <h2 id="readiness-heading" className="font-display mt-1 text-xl font-bold tracking-tight">
            {t('heading')}
          </h2>
          <p className="text-muted mt-1 text-sm">{t('body', { done: readiness.done, total: readiness.total })}</p>
        </div>
        <div
          className="relative grid size-14 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(var(--brand) ${percent * 3.6}deg, var(--surface-2) 0deg)` }}
          role="img"
          aria-label={t('percent', { percent })}
        >
          <span className="bg-surface font-display grid size-11 place-items-center rounded-full text-sm font-bold tabular-nums">
            {percent}%
          </span>
        </div>
      </div>
      <ol className="mt-5 grid gap-2 sm:grid-cols-2">
        {readiness.steps.map((step, index) => {
          const isNext = step.key === next?.key;
          return (
            <li key={step.key}>
              <Link
                href={`/events/${eventId}${step.path}`}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition',
                  step.done
                    ? 'border-transparent bg-[var(--surface-2)]/60'
                    : isNext
                      ? 'border-brand/50 bg-brand-soft/60 hover:shadow-[var(--shadow-1)]'
                      : 'border-border/70 hover:border-brand/40',
                )}
              >
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                    step.done ? 'bg-success text-white' : isNext ? 'bg-brand text-white' : 'bg-surface-2 text-muted',
                  )}
                >
                  {step.done ? <Check aria-hidden className="size-4" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-semibold', step.done && 'text-muted line-through')}>
                    {t(`steps.${step.key}.title`)}
                  </span>
                  {!step.done && (
                    <span className="text-muted block truncate text-xs">{t(`steps.${step.key}.body`)}</span>
                  )}
                </span>
                {!step.done && (
                  <ArrowRight
                    aria-hidden
                    className="text-muted size-4 shrink-0 transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-strong)]"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
