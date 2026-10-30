'use client';

import { Banner, Button, Card, Chip, DateText, FieldShell, Input, QRCode, Select } from '@tiwa/ui';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export interface InviteClientData {
  token: string;
  guest: {
    name: string;
    rsvp: string;
    plusOnes: number;
    meal: string | null;
    dietary: string | null;
  };
  event: {
    name: string;
    description: string | null;
    startsAt: string | null;
    endsAt: string | null;
    timezone: string;
    venueName: string | null;
    hostName: string;
    dressCode: string | null;
    momentsOn: boolean;
    allowForwarding: boolean;
  };
  presetResponse: 'YES' | 'NO' | null;
  checkinQr: string;
  googleCalUrl: string | null;
  icsUrl: string | null;
  passUrl: string | null;
  shareText: string;
}

/**
 * One-tap RSVP island — the ONLY JavaScript on the invite page
 * (UF-08, budget: < 15 KB). Email one-tap links land here with ?r=&sig=;
 * the island POSTs on load (scanners that only GET never record answers)
 * and offers Undo for 10 s. Plain Yes/No posts without extras confirm at
 * once: from opening the link a "yes" with no extras is exactly one tap.
 */
export function InviteClient({ data }: { data: InviteClientData }) {
  const t = useTranslations('invite');
  const router = useRouter();
  const [rsvp, setRsvp] = React.useState(data.guest.rsvp);
  const [plusOnes, setPlusOnes] = React.useState(data.guest.plusOnes);
  const [meal, setMeal] = React.useState(data.guest.meal ?? '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [showUndo, setShowUndo] = React.useState(false);
  const [undoUntil, setUndoUntil] = React.useState(0);
  const postedPreset = React.useRef<string | null>(null);

  async function post(response: 'YES' | 'NO', extra?: { plusOnes?: number; meal?: string }) {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.token, response, ...extra }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: { undoMs?: number } } | null;
      if (!res.ok || !body?.ok) throw new Error('rsvp failed');
      setRsvp(response);
      setShowUndo(true);
      setUndoUntil(Date.now() + (body.data?.undoMs ?? 10_000));
      router.refresh();
    } catch {
      setError(t('errors.sendFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.token, response: rsvp === 'YES' ? 'NO' : 'YES' }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!res.ok || !body?.ok) throw new Error('undo failed');
      setRsvp((current) => (current === 'YES' ? 'NO' : 'YES'));
      setShowUndo(false);
      router.refresh();
    } catch {
      setError(t('errors.sendFailed'));
    } finally {
      setBusy(false);
    }
  }

  // Email one-tap: ?r=yes&sig=… lands answered-but-unposted; POST on load.
  React.useEffect(() => {
    if (data.presetResponse && postedPreset.current !== data.presetResponse) {
      postedPreset.current = data.presetResponse;
      void post(data.presetResponse);
    }
    // Only the preset from the URL triggers an auto-post.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.presetResponse]);

  // Undo window countdown: dismiss after the deadline unless the guest taps first.
  const dismissAt = showUndo ? undoUntil : null;
  React.useEffect(() => {
    if (!dismissAt) return undefined;
    const remaining = dismissAt - Date.now();
    if (remaining <= 0) return undefined;
    const timer = setTimeout(() => setShowUndo(false), remaining);
    return () => clearTimeout(timer);
  }, [dismissAt]);

  return (
    <div className="flex flex-col gap-4 py-4">
      <Card className="flex flex-col gap-1 p-4">
        <p className="text-muted text-sm">{t('hostedBy', { host: data.event.hostName })}</p>
        <p className="text-sm">
          <DateText value={data.event.startsAt ?? ''} format="datetime" timeZone={data.event.timezone} />
        </p>
        {data.event.venueName && <p className="text-sm">{data.event.venueName}</p>}
        {data.event.dressCode && <Chip>{data.event.dressCode}</Chip>}
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      {rsvp !== 'YES' && rsvp !== 'NO' && (
        <div className="flex flex-col gap-2">
          <Button
            iconLeft={<Check aria-hidden className="size-5" />}
            loading={busy}
            onClick={() => void post('YES')}
            fullWidth
          >
            {t('coming')}
          </Button>
          <Button
            iconLeft={<X aria-hidden className="size-5" />}
            variant="secondary"
            loading={busy}
            onClick={() => void post('NO')}
            fullWidth
          >
            {t('cantCome')}
          </Button>
        </div>
      )}

      {rsvp === 'NO' && (
        <Card className="flex flex-col gap-2 p-4">
          <p className="font-medium">{t('declined')}</p>
          <p className="text-muted text-sm">{t('declinedHint')}</p>
          <div>
            <Button iconLeft={<Check aria-hidden className="size-5" />} loading={busy} onClick={() => void post('YES')}>
              {t('coming')}
            </Button>
          </div>
        </Card>
      )}

      {rsvp === 'YES' && data.passUrl && (
        <Card className="flex flex-col items-center gap-2 p-4">
          <QRCode value={data.checkinQr} size={192} label={t('passQr')} />
          <p className="text-muted text-sm">{t('passHint')}</p>
        </Card>
      )}

      {rsvp === 'YES' && (
        <Card className="flex flex-col gap-3 p-4">
          <p className="font-medium">{t('extrasHeading')}</p>
          <FieldShell id="rsvp-plusones" label={t('plusOnes')}>
            {() => (
              <Select
                label={t('plusOnes')}
                value={String(plusOnes)}
                options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                onValueChange={(value) => {
                  const next = Number(value);
                  setPlusOnes(next);
                  void post('YES', { plusOnes: next, meal });
                }}
              />
            )}
          </FieldShell>
          <FieldShell id="rsvp-meal" label={t('meal')}>
            {(describedBy) => (
              <Input
                id="rsvp-meal"
                aria-describedby={describedBy}
                value={meal}
                placeholder={t('mealPlaceholder')}
                onChange={(event) => setMeal(event.target.value)}
                onBlur={() => {
                  if (meal !== (data.guest.meal ?? '')) void post('YES', { plusOnes, meal });
                }}
              />
            )}
          </FieldShell>
        </Card>
      )}

      {showUndo && (
        <div>
          <Button variant="ghost" disabled={busy} onClick={() => void undo()}>
            {t('undo')}
          </Button>
        </div>
      )}

      {data.googleCalUrl && (
        <div className="flex flex-wrap gap-2">
          <a href={data.googleCalUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">
            {t('googleCal')}
          </a>
          {data.icsUrl && (
            <a href={data.icsUrl} download className="text-sm underline">
              {t('icsDownload')}
            </a>
          )}
          {data.passUrl && (
            <a href={data.passUrl} className="text-sm underline">
              {t('viewPass')}
            </a>
          )}
        </div>
      )}

      {data.event.allowForwarding && (
        <Card className="p-4">
          <p className="text-muted text-sm">{t('forwardHint')}</p>
        </Card>
      )}
    </div>
  );
}
