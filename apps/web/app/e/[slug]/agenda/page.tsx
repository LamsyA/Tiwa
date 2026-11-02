import { publicAgenda, type AgendaItem } from '@tiwa/core';
import { cn } from '@tiwa/ui';
import { CalendarClock, Check, MapPin, Radio } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AutoRefresh } from './auto-refresh.js';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations('agenda');
  const data = await publicAgenda(slug).catch(() => null);
  return { title: data ? t('metaTitle', { event: data.event.name }) : t('title'), robots: { index: false } };
}

/** Request time, outside render so the purity lint is satisfied. */
function currentTime(): Date {
  return new Date();
}

/** Live guest agenda: the public parts of the run-of-show, opened on the event day. */
export default async function AgendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations('agenda');
  const data = await publicAgenda(slug, currentTime()).catch(() => null);
  if (!data) notFound();
  const { event, items, open, opensOn } = data;
  const clock = (at: Date) =>
    new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: event.timezone }).format(at);
  const shift = (at: Date, minutes: number) => new Date(at.getTime() + minutes * 60_000);
  const now = items.find((row) => row.state === 'now') ?? null;
  const next = items.find((row) => row.state === 'next') ?? null;
  const done = items.filter((row) => row.state === 'done').length;
  const accent = event.themeColor ?? 'var(--brand)';
  const opensText = opensOn
    ? new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
        new Date(`${opensOn}T12:00:00Z`),
      )
    : null;

  return (
    <main className="bg-bg min-h-dvh">
      {open && <AutoRefresh />}
      <header
        className="relative isolate overflow-hidden px-4 pt-10 pb-24 text-white sm:pt-14"
        style={{
          background: `radial-gradient(120% 120% at 100% 0%, color-mix(in oklab, ${accent} 75%, white 0%) 0%, transparent 60%), linear-gradient(160deg, color-mix(in oklab, ${accent} 70%, black) 0%, #0d0a12 100%)`,
        }}
      >
        <div aria-hidden className="absolute -top-24 -left-20 -z-10 size-80 rounded-full bg-white/10 blur-3xl" />
        <div className="mx-auto w-full max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">
            <CalendarClock aria-hidden className="size-4" />
            {t('eyebrow')}
          </p>
          <h1 className="font-display mt-3 text-3xl leading-tight font-bold tracking-[-0.02em] sm:text-5xl">
            {event.name}
          </h1>
          {event.venue && (
            <p className="mt-3 flex items-center gap-2 text-sm text-white/80">
              <MapPin aria-hidden className="size-4" />
              {event.venue}
            </p>
          )}
          {open && items.length > 0 && (
            <div className="mt-6 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-700"
                  style={{ width: `${Math.round((done / items.length) * 100)}%` }}
                />
              </div>
              <span className="text-xs font-medium text-white/80 tabular-nums">
                {t('progress', { done, total: items.length })}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-16 flex w-full max-w-2xl flex-col gap-4 px-4 pb-16">
        {!open ? (
          <section className="bg-surface ring-border/70 rounded-3xl p-6 text-center shadow-[var(--shadow-2)] ring-1">
            <span className="bg-brand-soft text-brand-strong mx-auto flex size-12 items-center justify-center rounded-2xl">
              <CalendarClock aria-hidden className="size-6" />
            </span>
            <h2 className="font-display mt-3 text-xl font-bold">{t('closedTitle')}</h2>
            <p className="text-muted mt-1 text-sm">
              {opensText ? t('closedBody', { date: opensText }) : t('closedNoDate')}
            </p>
          </section>
        ) : items.length === 0 ? (
          <section className="bg-surface ring-border/70 rounded-3xl p-6 text-center shadow-[var(--shadow-2)] ring-1">
            <h2 className="font-display text-xl font-bold">{t('emptyTitle')}</h2>
            <p className="text-muted mt-1 text-sm">{t('emptyBody')}</p>
          </section>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2">
              <HeroCard
                label={t('now')}
                live
                title={now?.title ?? t('between')}
                meta={now ? t('since', { time: clock(shift(now.startsAt, now.lateByMin)) }) : null}
              />
              <HeroCard
                label={t('next')}
                title={next?.title ?? t('allDone')}
                meta={next ? clock(shift(next.startsAt, next.lateByMin)) : null}
              />
            </section>

            <section className="bg-surface ring-border/70 rounded-3xl p-4 shadow-[var(--shadow-1)] ring-1 sm:p-6">
              <h2 className="font-display mb-4 text-lg font-bold">{t('fullAgenda')}</h2>
              <ol className="relative flex flex-col">
                {items.map((row, index) => (
                  <AgendaRow
                    key={row.id}
                    row={row}
                    last={index === items.length - 1}
                    time={clock(shift(row.startsAt, row.lateByMin))}
                    lateLabel={row.lateByMin > 0 ? t('late', { count: row.lateByMin }) : null}
                    stateLabel={row.state === 'now' ? t('now') : row.state === 'skipped' ? t('skipped') : null}
                  />
                ))}
              </ol>
            </section>
            <p className="text-muted text-center text-xs">{t('liveNote')}</p>
          </>
        )}
      </div>
    </main>
  );
}

function HeroCard({
  label,
  title,
  meta,
  live = false,
}: {
  label: string;
  title: string;
  meta: string | null;
  live?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-3xl p-5 shadow-[var(--shadow-2)] ring-1',
        live ? 'bg-text text-bg ring-transparent' : 'bg-surface ring-border/70',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-2 text-xs font-semibold tracking-wide uppercase',
          live ? 'opacity-70' : 'text-muted',
        )}
      >
        {live && <Radio aria-hidden className="size-3.5 animate-pulse text-red-400" />}
        {label}
      </p>
      <p className="font-display mt-2 text-xl leading-snug font-bold">{title}</p>
      {meta && <p className={cn('mt-1 text-sm', live ? 'opacity-70' : 'text-muted')}>{meta}</p>}
    </div>
  );
}

function AgendaRow({
  row,
  last,
  time,
  lateLabel,
  stateLabel,
}: {
  row: AgendaItem;
  last: boolean;
  time: string;
  lateLabel: string | null;
  stateLabel: string | null;
}) {
  const isNow = row.state === 'now';
  const isDone = row.state === 'done' || row.state === 'skipped';
  return (
    <li className="relative flex gap-4 pb-5 last:pb-0" aria-current={isNow ? 'step' : undefined}>
      {!last && (
        <span
          aria-hidden
          className={cn('absolute top-7 bottom-0 left-[11px] w-0.5', isDone ? 'bg-brand/50' : 'bg-border')}
        />
      )}
      <span
        aria-hidden
        className={cn(
          'relative z-10 mt-1 flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-[var(--surface)]',
          isDone ? 'bg-brand text-white' : isNow ? 'bg-text' : 'bg-surface-2 ring-border border-border border',
        )}
      >
        {isDone && <Check className="size-3.5" />}
        {isNow && <span className="size-2 animate-ping rounded-full bg-red-400" />}
      </span>
      <div
        className={cn(
          'min-w-0 flex-1 rounded-2xl px-3 py-2 transition',
          isNow && 'bg-brand-soft/60 ring-brand/30 ring-1',
          isDone && 'opacity-60',
        )}
      >
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-display font-bold tabular-nums">{time}</span>
          {lateLabel && <span className="text-danger text-xs font-medium">{lateLabel}</span>}
          {stateLabel && <span className="text-brand-strong text-xs font-semibold uppercase">{stateLabel}</span>}
        </p>
        <p className={cn('font-medium', row.state === 'skipped' && 'line-through')}>{row.title}</p>
      </div>
    </li>
  );
}
