import { env } from '@tiwa/config';
import { UNDO_WINDOW_MS_PUBLIC, answerRsvp, checkinQrValue, invitePage } from '@tiwa/core';
import { QRCode, buttonClasses } from '@tiwa/ui';
import { CalendarPlus, Check, Download, ListChecks, MapPin, PartyPopper, Shirt, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { googleCalendarUrl } from '@/lib/ics.js';

export const dynamic = 'force-dynamic';

/**
 * UF-08: guest invitation page — no account, no app, and (P4-T12) no client
 * JavaScript. Every interaction is a plain HTML form posting to a server
 * action, so the page paints with static HTML + CSS only: the heaviest
 * guest-facing surface stays far under the JS budget while one-tap RSVP,
 * extras, undo, the pass QR and calendar links all keep working.
 * Plain GETs record nothing (UF-08-3): answering always takes a POST.
 */

function invalid(token: string): never {
  redirect(`/i/${token}?error=invalid`);
}

function failed(token: string, error: unknown): never {
  if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'CONFLICT') {
    redirect(`/i/${token}?error=closed`);
  }
  redirect(`/i/${token}?error=sendFailed`);
}

async function answerAction(formData: FormData): Promise<void> {
  'use server';
  const token = String(formData.get('token') ?? '');
  const response = String(formData.get('response') ?? '');
  if (response !== 'YES' && response !== 'NO') invalid(token);
  const plusRaw = formData.has('plusOnes') ? String(formData.get('plusOnes') ?? '') : null;
  const hasMeal = formData.has('meal');
  const mealRaw = String(formData.get('meal') ?? '').trim();
  try {
    await answerRsvp({
      token,
      response,
      ...(plusRaw !== null && plusRaw !== '' ? { plusOnes: Math.max(0, Math.min(20, Number(plusRaw))) } : {}),
      ...(hasMeal ? { meal: mealRaw.slice(0, 60) } : {}),
    });
  } catch (error) {
    failed(token, error);
  }
  // POST-Redirect-GET: this page ships no client JS to apply an RSC refresh,
  // so a successful answer navigates back to the invite (answered state).
  redirect(`/i/${token}`);
}

async function undoAction(formData: FormData): Promise<void> {
  'use server';
  const token = String(formData.get('token') ?? '');
  const page = await invitePage(token).catch(() => null);
  if (!page) notFound();
  try {
    await answerRsvp({ token, response: page.guest.rsvp === 'YES' ? 'NO' : 'YES' });
  } catch (error) {
    failed(token, error);
  }
  redirect(`/i/${token}`);
}

const inputClasses =
  'border-border bg-bg text-text placeholder:text-muted h-11 w-full rounded-xl border px-3 text-base focus:border-focus focus:outline-none';

/** UF-08: guest invitation page — no account, no app. */
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const t = await getTranslations('invite');
  const page = await invitePage(decodeURIComponent(token)).catch(() => null);
  if (!page) notFound();

  const base = env.APP_URL.replace(/\/$/, '');
  const checkin =
    env.AUTH_SECRET && page.guest.rsvp === 'YES' ? checkinQrValue(page.guest.id, page.event.id, env.AUTH_SECRET) : '';
  const calendar = page.event.startsAt
    ? googleCalendarUrl({
        title: page.event.name,
        details: page.event.description ?? undefined,
        location: page.event.venueName ?? undefined,
        startsAt: page.event.startsAt,
        endsAt: page.event.endsAt,
      })
    : null;
  // Render-time "now" is deterministic here: this page ships zero client JS,
  // so there is no hydration mismatch to guard against.
  // eslint-disable-next-line react-hooks/purity -- server render timestamp, no hydration involved
  const now = Date.now();
  const showUndo =
    page.guest.respondedAt != null && now - new Date(page.guest.respondedAt).getTime() < UNDO_WINDOW_MS_PUBLIC;
  const err = query.error === 'closed' ? t('errors.closed') : query.error ? t('errors.sendFailed') : null;

  const firstName = page.guest.name.trim().split(/\s+/)[0] ?? page.guest.name;
  const starts = page.event.startsAt ? new Date(page.event.startsAt) : null;
  const part = (options: Intl.DateTimeFormatOptions) =>
    starts ? new Intl.DateTimeFormat('en', { ...options, timeZone: page.event.timezone }).format(starts) : '';
  const daysLeft = starts ? Math.ceil((starts.getTime() - now) / 86_400_000) : null;
  const answered = page.guest.rsvp === 'YES' || page.guest.rsvp === 'NO';
  const card = 'bg-bg/80 border-border/70 rounded-3xl border p-5 shadow-[var(--shadow-1)] backdrop-blur';

  return (
    <div data-frame="guest" className="bg-surface-2/40 min-h-dvh">
      <div className="mx-auto flex w-full max-w-[560px] flex-col">
        {/* Invitation card (UF-08): the event as a keepsake, then one-tap RSVP. */}
        <header
          className="relative overflow-hidden px-6 pt-10 pb-24 text-white"
          style={{
            background: page.event.themeColor
              ? `linear-gradient(150deg, ${page.event.themeColor}, color-mix(in oklab, ${page.event.themeColor} 55%, black))`
              : 'linear-gradient(150deg, color-mix(in oklab, var(--brand) 92%, black 4%), color-mix(in oklab, var(--accent) 55%, var(--brand)))',
          }}
        >
          <div aria-hidden className="tiwa-grid-bg absolute inset-0 opacity-15" />
          <div aria-hidden className="absolute -top-24 -right-20 size-72 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-col items-center gap-3 text-center">
            <p className="text-xs font-semibold tracking-[0.25em] text-white/80 uppercase">{t('youreInvited')}</p>
            <p className="text-lg text-white/90">{t('dear', { name: firstName })}</p>
            <h1 className="font-display text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
              {page.event.name}
            </h1>
            <p className="text-sm text-white/80">{t('hostedBy', { host: page.event.hostName })}</p>
          </div>
        </header>

        <main className="relative -mt-16 flex flex-col gap-4 px-4 pb-6">
          <section className={`${card} flex flex-col gap-4`}>
            {starts && (
              <div className="flex items-center gap-4">
                <div className="border-border/70 bg-bg flex w-16 shrink-0 flex-col overflow-hidden rounded-2xl border text-center shadow-[var(--shadow-1)]">
                  <span className="bg-brand-strong text-on-brand py-0.5 text-[11px] font-bold tracking-widest uppercase">
                    {part({ month: 'short' })}
                  </span>
                  <span className="font-display py-1 text-2xl font-bold">{part({ day: 'numeric' })}</span>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">
                    {part({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-muted text-sm">
                    {part({ hour: 'numeric', minute: '2-digit' })}
                    {daysLeft !== null && daysLeft > 0 && !page.event.over
                      ? ` · ${t('daysToGo', { count: daysLeft })}`
                      : ''}
                  </p>
                </div>
              </div>
            )}
            {page.event.venueName && (
              <div className="flex items-center gap-4">
                <span className="bg-brand/10 text-brand-strong grid size-16 shrink-0 place-items-center rounded-2xl">
                  <MapPin className="size-6" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{page.event.venueName}</p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(page.event.venueName)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-strong text-sm font-medium hover:underline"
                  >
                    {t('directions')}
                  </a>
                </div>
              </div>
            )}
            {page.event.dressCode && (
              <div className="flex items-center gap-4">
                <span className="bg-accent/15 text-accent grid size-16 shrink-0 place-items-center rounded-2xl">
                  <Shirt className="size-6" aria-hidden />
                </span>
                <div>
                  <p className="text-muted text-xs font-semibold tracking-wide uppercase">{t('dressCode')}</p>
                  <p className="font-semibold">{page.event.dressCode}</p>
                </div>
              </div>
            )}
            {page.event.description && (
              <p className="text-muted border-border/60 border-t pt-4 text-sm leading-relaxed whitespace-pre-line">
                {page.event.description}
              </p>
            )}
          </section>

          {err && (
            <div role="alert" className="border-danger/40 bg-danger-soft rounded-2xl border p-3 text-base">
              {err}
            </div>
          )}

          {!answered && (
            <section className={`${card} flex flex-col gap-3`}>
              <p className="text-center font-semibold">{t('willYouCome')}</p>
              <form action={answerAction} className="grid grid-cols-2 gap-3">
                <input type="hidden" name="token" value={page.token} />
                <button
                  type="submit"
                  name="response"
                  value="YES"
                  className={buttonClasses({ size: 'lg', className: 'rounded-full' })}
                >
                  <Check aria-hidden className="size-5" />
                  {t('coming')}
                </button>
                <button
                  type="submit"
                  name="response"
                  value="NO"
                  className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'rounded-full' })}
                >
                  <X aria-hidden className="size-5" />
                  {t('cantCome')}
                </button>
              </form>
            </section>
          )}

          {page.guest.rsvp === 'NO' && (
            <section className={`${card} flex flex-col items-center gap-3 text-center`}>
              <p className="font-display text-xl font-bold">{t('declined')}</p>
              <p className="text-muted text-sm">{t('declinedHint')}</p>
              <form action={answerAction}>
                <input type="hidden" name="token" value={page.token} />
                <button
                  type="submit"
                  name="response"
                  value="YES"
                  className={buttonClasses({ className: 'rounded-full' })}
                >
                  <Check aria-hidden className="size-5" />
                  {t('coming')}
                </button>
              </form>
            </section>
          )}

          {page.guest.rsvp === 'YES' && (
            <section className="border-success/40 bg-success/5 flex items-center gap-3 rounded-3xl border p-4">
              <span className="bg-success grid size-10 shrink-0 place-items-center rounded-full text-white">
                <PartyPopper className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold">{t('seeYouThere', { name: firstName })}</p>
                <p className="text-muted text-sm">{t('passHint')}</p>
              </div>
            </section>
          )}

          {page.guest.rsvp === 'YES' && checkin && (
            <section className="bg-bg border-border/70 relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl border p-6 shadow-[var(--shadow-2)]">
              <span
                aria-hidden
                className="bg-surface-2/40 absolute top-1/2 -left-4 size-8 -translate-y-1/2 rounded-full"
              />
              <span
                aria-hidden
                className="bg-surface-2/40 absolute top-1/2 -right-4 size-8 -translate-y-1/2 rounded-full"
              />
              <p className="text-muted text-xs font-semibold tracking-[0.2em] uppercase">{t('yourPass')}</p>
              <QRCode value={checkin} size={200} label={t('passQr')} className="text-text max-w-60 rounded-2xl p-2" />
              <p className="font-semibold">{page.guest.name}</p>
              <a
                href={`${base}/i/${page.token}/pass`}
                className="text-brand-strong text-sm font-medium hover:underline"
              >
                {t('viewPass')}
              </a>
            </section>
          )}

          {page.guest.rsvp === 'YES' && (
            <form action={answerAction} className={`${card} flex flex-col gap-3`}>
              <input type="hidden" name="token" value={page.token} />
              <input type="hidden" name="response" value="YES" />
              <p className="font-semibold">{t('extrasHeading')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="rsvp-plusones" className="text-text mb-1 block text-sm font-medium">
                    {t('plusOnes')}
                  </label>
                  <select
                    id="rsvp-plusones"
                    name="plusOnes"
                    defaultValue={String(page.guest.plusOnes)}
                    className={inputClasses}
                  >
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="rsvp-meal" className="text-text mb-1 block text-sm font-medium">
                    {t('meal')}
                  </label>
                  <input
                    id="rsvp-meal"
                    name="meal"
                    defaultValue={page.guest.meal ?? ''}
                    placeholder={t('mealPlaceholder')}
                    className={inputClasses}
                  />
                </div>
              </div>
              <div>
                <button type="submit" className={buttonClasses({ variant: 'secondary', className: 'rounded-full' })}>
                  {t('extrasSave')}
                </button>
              </div>
            </form>
          )}

          {showUndo && (
            <form action={undoAction} className="text-center">
              <input type="hidden" name="token" value={page.token} />
              <button type="submit" className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
                {t('undo')}
              </button>
            </form>
          )}

          {calendar && page.guest.rsvp !== 'NO' && (
            <div className="grid grid-cols-2 gap-2">
              <a
                href={calendar}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ variant: 'secondary', className: 'rounded-full' })}
              >
                <CalendarPlus aria-hidden className="size-4" />
                {t('googleCal')}
              </a>
              <a
                href={`${base}/api/ics/${page.token}?kind=invite`}
                download
                className={buttonClasses({ variant: 'secondary', className: 'rounded-full' })}
              >
                <Download aria-hidden className="size-4" />
                {t('icsDownload')}
              </a>
            </div>
          )}

          {page.guest.rsvp !== 'NO' && (
            <a
              href={`${base}/e/${page.event.slug}/agenda`}
              className={`${card} hover:border-brand/60 flex items-center justify-between gap-3 transition`}
            >
              <span className="flex items-center gap-3">
                <span className="bg-brand/10 text-brand-strong grid size-10 place-items-center rounded-2xl">
                  <ListChecks className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{t('agendaTitle')}</span>
                  <span className="text-muted block text-sm">{t('agendaHint')}</span>
                </span>
              </span>
              <span aria-hidden className="text-brand-strong text-lg">
                →
              </span>
            </a>
          )}

          {page.event.allowForwarding && <p className="text-muted px-2 text-center text-xs">{t('forwardHint')}</p>}
        </main>
        <footer className="text-muted flex flex-col items-center gap-1 px-4 pb-10 text-xs">
          <span className="font-display text-text text-sm font-bold">Tiwa</span>
          {t('poweredBy')}
        </footer>
      </div>
    </div>
  );
}
