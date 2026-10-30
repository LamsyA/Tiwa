import { env } from '@tiwa/config';
import { UNDO_WINDOW_MS_PUBLIC, answerRsvp, checkinQrValue, invitePage } from '@tiwa/core';
import { GuestShell, QRCode, buttonClasses } from '@tiwa/ui';
import { Check, X } from 'lucide-react';
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
  'border-border bg-bg text-text placeholder:text-muted h-11 w-full rounded-md border px-3 text-base focus:border-focus focus:outline-none';

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

  return (
    <GuestShell title={page.event.name}>
      <div className="flex flex-col gap-4 py-4">
        <div className="bg-surface border-border flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-muted text-sm">{t('hostedBy', { host: page.event.hostName })}</p>
          {page.event.startsAt && (
            <p className="text-sm">
              {new Intl.DateTimeFormat('en', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: page.event.timezone,
              }).format(new Date(page.event.startsAt))}
            </p>
          )}
          {page.event.venueName && <p className="text-sm">{page.event.venueName}</p>}
          {page.event.dressCode && (
            <p className="mt-1">
              <span className="border-border bg-surface text-muted inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium">
                {page.event.dressCode}
              </span>
            </p>
          )}
        </div>

        {err && (
          <div role="alert" className="border-danger/40 bg-danger-soft rounded-lg border p-3 text-base">
            {err}
          </div>
        )}

        {page.guest.rsvp !== 'YES' && page.guest.rsvp !== 'NO' && (
          <form action={answerAction} className="flex flex-col gap-2">
            <input type="hidden" name="token" value={page.token} />
            <button type="submit" name="response" value="YES" className={buttonClasses({ fullWidth: true })}>
              <Check aria-hidden className="size-5" />
              {t('coming')}
            </button>
            <button
              type="submit"
              name="response"
              value="NO"
              className={buttonClasses({ variant: 'secondary', fullWidth: true })}
            >
              <X aria-hidden className="size-5" />
              {t('cantCome')}
            </button>
          </form>
        )}

        {page.guest.rsvp === 'NO' && (
          <div className="bg-surface border-border flex flex-col gap-2 rounded-lg border p-4">
            <p className="font-medium">{t('declined')}</p>
            <p className="text-muted text-sm">{t('declinedHint')}</p>
            <form action={answerAction}>
              <input type="hidden" name="token" value={page.token} />
              <button type="submit" name="response" value="YES" className={buttonClasses()}>
                <Check aria-hidden className="size-5" />
                {t('coming')}
              </button>
            </form>
          </div>
        )}

        {page.guest.rsvp === 'YES' && checkin && (
          <div className="bg-surface border-border flex flex-col items-center gap-2 rounded-lg border p-4">
            <QRCode
              value={checkin}
              size={192}
              label={t('passQr')}
              className="text-text max-w-60 rounded-md border p-2"
            />
            <p className="text-muted text-sm">{t('passHint')}</p>
          </div>
        )}

        {page.guest.rsvp === 'YES' && (
          <form action={answerAction} className="bg-surface border-border flex flex-col gap-3 rounded-lg border p-4">
            <input type="hidden" name="token" value={page.token} />
            <input type="hidden" name="response" value="YES" />
            <p className="font-medium">{t('extrasHeading')}</p>
            <div>
              <label htmlFor="rsvp-plusones" className="mb-1 block text-sm font-medium text-text">
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
              <label htmlFor="rsvp-meal" className="mb-1 block text-sm font-medium text-text">
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
            <div>
              <button type="submit" className={buttonClasses({ variant: 'secondary' })}>
                {t('extrasSave')}
              </button>
            </div>
          </form>
        )}

        {showUndo && (
          <form action={undoAction}>
            <input type="hidden" name="token" value={page.token} />
            <button type="submit" className={buttonClasses({ variant: 'ghost' })}>
              {t('undo')}
            </button>
          </form>
        )}

        {calendar && (
          <div className="flex flex-wrap gap-2">
            <a href={calendar} target="_blank" rel="noopener noreferrer" className="text-sm underline">
              {t('googleCal')}
            </a>
            <a href={`${base}/api/ics/${page.token}?kind=invite`} download className="text-sm underline">
              {t('icsDownload')}
            </a>
            <a href={`${base}/i/${page.token}/pass`} className="text-sm underline">
              {t('viewPass')}
            </a>
          </div>
        )}

        {page.event.allowForwarding && (
          <div className="bg-surface border-border rounded-lg border p-4">
            <p className="text-muted text-sm">{t('forwardHint')}</p>
          </div>
        )}
      </div>
    </GuestShell>
  );
}
