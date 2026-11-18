import { loadEventAccess, publicAgenda, type AgendaItem } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { cn } from '@tiwa/ui';
import { CalendarDays, Check, MapPin, Radio, Sparkles, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { KindIcon, customLabel } from '@/components/programme/kinds.js';
import { getCtx } from '@/lib/ctx.js';
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

/** The event team may preview a draft programme before it is published (D-X92). */
async function canPreview(slug: string): Promise<boolean> {
  const { actor } = await getCtx();
  if (!actor) return false;
  const event = await prisma.event.findUnique({ where: { slug }, select: { id: true } });
  return event ? Boolean(await loadEventAccess(actor.userId, event.id)) : false;
}

/**
 * D-X92: the guest programme — the order of the day on every guest's phone
 * instead of a printed programme. Any time before the day it reads like a
 * beautiful printed programme; on the day it goes live (now / next / done).
 */
export default async function AgendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations('agenda');
  const at = currentTime();
  const data =
    (await publicAgenda(slug, at).catch(() => null)) ??
    ((await canPreview(slug)) ? await publicAgenda(slug, at, { allowDraft: true }).catch(() => null) : null);
  if (!data) notFound();
  const { event, items, open } = data;
  const clock = (value: Date) =>
    new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: event.timezone }).format(value);
  const shift = (value: Date, minutes: number) => new Date(value.getTime() + minutes * 60_000);
  const dayLabel = (date: string) =>
    new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
      new Date(`${date}T12:00:00Z`),
    );
  const now = items.find((row) => row.state === 'now') ?? null;
  const next = items.find((row) => row.state === 'next') ?? null;
  const done = items.filter((row) => row.state === 'done').length;
  const accent = event.themeColor ?? 'var(--brand)';
  const eventDate = event.startsAt
    ? new Intl.DateTimeFormat('en', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: event.timezone,
      }).format(event.startsAt)
    : null;

  const days = new Map<string, AgendaItem[]>();
  for (const row of items) days.set(row.date, [...(days.get(row.date) ?? []), row]);
  const multiDay = days.size > 1;

  return (
    <main className="bg-bg min-h-dvh">
      {open && items.length > 0 && <AutoRefresh />}
      <header
        className="relative isolate overflow-hidden px-4 pt-10 pb-28 text-white sm:pt-16"
        style={{
          background: `radial-gradient(120% 120% at 100% 0%, color-mix(in oklab, ${accent} 75%, white 0%) 0%, transparent 60%), linear-gradient(160deg, color-mix(in oklab, ${accent} 70%, black) 0%, #0d0a12 100%)`,
        }}
      >
        <div aria-hidden className="absolute -top-24 -left-20 -z-10 size-80 rounded-full bg-white/10 blur-3xl" />
        <div
          aria-hidden
          className="absolute right-[-6rem] bottom-[-6rem] -z-10 size-72 rounded-full bg-white/5 blur-2xl"
        />
        <div className="mx-auto w-full max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-white/80 uppercase ring-1 ring-white/15">
            {open ? (
              <Radio aria-hidden className="size-3.5 text-red-300" />
            ) : (
              <Sparkles aria-hidden className="size-3.5" />
            )}
            {open ? t('eyebrowLive') : t('eyebrow')}
          </p>
          <h1 className="font-display mt-4 text-[2rem] leading-[1.1] font-bold tracking-[-0.02em] sm:text-5xl">
            {event.name}
          </h1>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-white/80">
            {eventDate && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays aria-hidden className="size-4" />
                {eventDate}
              </span>
            )}
            {event.venue && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin aria-hidden className="size-4" />
                {event.venue}
              </span>
            )}
          </div>
          {open && items.length > 0 && (
            <div className="mx-auto mt-6 flex max-w-sm items-center gap-3">
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

      <div className="relative z-10 mx-auto -mt-20 flex w-full max-w-2xl flex-col gap-4 px-4 pb-16">
        {items.length === 0 ? (
          <section className="bg-surface ring-border/70 rounded-3xl p-8 text-center shadow-[var(--shadow-2)] ring-1">
            <span className="bg-brand-soft text-brand-strong mx-auto flex size-12 items-center justify-center rounded-2xl">
              <Sparkles aria-hidden className="size-6" />
            </span>
            <h2 className="font-display mt-3 text-xl font-bold">{t('emptyTitle')}</h2>
            <p className="text-muted mt-1 text-sm">{t('emptyBody')}</p>
          </section>
        ) : (
          <>
            {open && (
              <section className="grid gap-3 sm:grid-cols-2">
                <HeroCard
                  label={t('now')}
                  live
                  item={now}
                  title={now?.title ?? t('between')}
                  meta={now ? t('since', { time: clock(shift(now.startsAt, now.lateByMin)) }) : null}
                />
                <HeroCard
                  label={t('next')}
                  item={next}
                  title={next?.title ?? t('allDone')}
                  meta={next ? clock(shift(next.startsAt, next.lateByMin)) : null}
                />
              </section>
            )}

            {[...days.entries()].map(([date, rows]) => (
              <section
                key={date}
                className="bg-surface ring-border/70 rounded-3xl p-4 shadow-[var(--shadow-2)] ring-1 sm:p-7"
              >
                <div className="mb-5 flex items-center gap-3">
                  <span aria-hidden className="bg-border h-px flex-1" />
                  <h2 className="font-display text-center text-sm font-bold tracking-[0.18em] uppercase">
                    {multiDay && date
                      ? dayLabel(date)
                      : (event.programmeTitle ?? (open ? t('fullAgenda') : t('orderOfDay')))}
                  </h2>
                  <span aria-hidden className="bg-border h-px flex-1" />
                </div>
                <ol className="relative flex flex-col">
                  {rows.map((row, index) => (
                    <AgendaRow
                      key={row.id}
                      row={row}
                      live={open}
                      last={index === rows.length - 1}
                      time={clock(shift(row.startsAt, row.lateByMin))}
                      endTime={row.endsAt && !open ? clock(row.endsAt) : null}
                      lateLabel={row.lateByMin > 0 ? t('late', { count: row.lateByMin }) : null}
                      stateLabel={row.state === 'now' ? t('now') : row.state === 'skipped' ? t('skipped') : null}
                    />
                  ))}
                </ol>
              </section>
            ))}
            <p className="text-muted text-center text-xs">{open ? t('liveNote') : t('soonNote')}</p>
          </>
        )}
        <p className="text-muted/80 text-center text-[11px] tracking-wide">{t('poweredBy')}</p>
      </div>
    </main>
  );
}

function HeroCard({
  label,
  title,
  meta,
  item,
  live = false,
}: {
  label: string;
  title: string;
  meta: string | null;
  item: AgendaItem | null;
  live?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-3xl p-5 shadow-[var(--shadow-2)] ring-1',
        live ? 'bg-text text-bg ring-transparent' : 'bg-surface ring-border/70',
      )}
    >
      {item && <KindIcon kind={item.kind} className={cn('size-11', live && 'bg-white/10 text-white')} />}
      <div className="min-w-0">
        <p
          className={cn(
            'flex items-center gap-2 text-xs font-semibold tracking-wide uppercase',
            live ? 'opacity-70' : 'text-muted',
          )}
        >
          {live && <Radio aria-hidden className="size-3.5 animate-pulse text-red-400" />}
          {label}
        </p>
        <p className="font-display mt-1 text-xl leading-snug font-bold">{title}</p>
        {item && item.who.length > 0 && (
          <p className={cn('mt-0.5 text-sm', live ? 'opacity-75' : 'text-muted')}>{item.who.join(' · ')}</p>
        )}
        {meta && <p className={cn('mt-1 text-sm', live ? 'opacity-70' : 'text-muted')}>{meta}</p>}
      </div>
    </div>
  );
}

function AgendaRow({
  row,
  live,
  last,
  time,
  endTime,
  lateLabel,
  stateLabel,
}: {
  row: AgendaItem;
  live: boolean;
  last: boolean;
  time: string;
  endTime: string | null;
  lateLabel: string | null;
  stateLabel: string | null;
}) {
  const isNow = row.state === 'now';
  const isDone = row.state === 'done' || row.state === 'skipped';
  return (
    <li className="relative flex gap-3 pb-6 last:pb-0 sm:gap-4" aria-current={isNow ? 'step' : undefined}>
      <div className="w-16 shrink-0 pt-2 text-right sm:w-20">
        <p className="font-display text-sm font-bold tabular-nums">{time}</p>
        {endTime && <p className="text-muted text-xs tabular-nums">{endTime}</p>}
      </div>
      <div className="relative flex flex-col items-center">
        <KindIcon kind={row.kind} className={cn('relative z-10 size-10', isDone && live && 'opacity-50')} />
        {!last && (
          <span aria-hidden className={cn('mt-1 w-0.5 flex-1', isDone && live ? 'bg-brand/40' : 'bg-border')} />
        )}
      </div>
      <div
        className={cn(
          'min-w-0 flex-1 rounded-2xl px-3 py-2 transition',
          isNow && 'bg-brand-soft/60 ring-brand/30 ring-1',
          isDone && live && 'opacity-55',
        )}
      >
        {(lateLabel || stateLabel || (isDone && live)) && (
          <p className="flex flex-wrap items-center gap-x-2 text-xs">
            {stateLabel && <span className="text-brand-strong font-semibold uppercase">{stateLabel}</span>}
            {lateLabel && <span className="text-danger font-medium">{lateLabel}</span>}
            {isDone && live && row.state === 'done' && <Check aria-hidden className="text-success size-3.5" />}
          </p>
        )}
        {customLabel(row.kind) && (
          <p className="text-brand-strong text-[11px] font-semibold tracking-wide uppercase">{customLabel(row.kind)}</p>
        )}
        <p className={cn('leading-snug font-semibold', row.state === 'skipped' && 'line-through')}>{row.title}</p>
        {row.who.length > 0 && (
          <p className="text-muted mt-0.5 flex items-center gap-1 text-sm">
            <Users aria-hidden className="size-3.5" />
            {row.who.join(' · ')}
          </p>
        )}
        {row.description && <p className="text-muted mt-1 text-sm leading-relaxed">{row.description}</p>}
        {row.room && <p className="text-muted mt-1 text-xs">{row.room}</p>}
      </div>
    </li>
  );
}
