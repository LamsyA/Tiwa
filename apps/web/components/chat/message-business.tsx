'use client';

import { Banner, Button, ResponsiveDialog, Select, Textarea } from '@tiwa/ui';
import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { startChat } from '@/app/inbox/actions.js';
import { newClientMessageId } from '@/lib/chat-outbox.js';

interface StartContext {
  signedIn: boolean;
  own: boolean;
  events: { id: string; name: string; date: string | null; guests: number | null }[];
}

/**
 * [Message] for a business (UF-30 steps 1–2; UF-31 for guest enquiries).
 * Works on cached public pages: the session check happens on click. Signed-out
 * visitors go to login and come back with the sheet open (`?message=1`).
 * An existing thread for the same parties and event is reopened by the server.
 */
export function MessageBusiness({
  orgId,
  orgName,
  guestEventId,
  variant = 'primary',
}: {
  orgId: string;
  orgName: string;
  /** Guest enquiry after an event (GUEST_ENQUIRY context, fixed event). */
  guestEventId?: string;
  variant?: 'primary' | 'secondary';
}) {
  const t = useTranslations('inbox');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [context, setContext] = React.useState<StartContext | null>(null);
  const [open, setOpen] = React.useState(false);
  const [eventId, setEventId] = React.useState<string>('');
  const [body, setBody] = React.useState('');
  const [warning, setWarning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const suggestion = React.useCallback(
    (event: StartContext['events'][number] | undefined) => {
      if (!event?.date) return t('suggestionPlain');
      return event.guests
        ? t('suggestion', { date: event.date, guests: event.guests })
        : t('suggestionNoGuests', { date: event.date });
    },
    [t],
  );

  const begin = React.useCallback(async () => {
    setError(null);
    const response = await fetch(`/api/chat/start-context?orgId=${orgId}`, { cache: 'no-store' }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as StartContext | null;
    if (!data?.signedIn) {
      const back = `${pathname}?${new URLSearchParams({ ...Object.fromEntries(params.entries()), message: orgId })}`;
      router.push(`/login?next=${encodeURIComponent(back)}`);
      return;
    }
    setContext(data);
    const first = guestEventId ? undefined : data.events[0];
    setEventId(first?.id ?? '');
    setBody(guestEventId ? t('suggestionPlain') : suggestion(first));
    setWarning(false);
    setOpen(true);
  }, [orgId, pathname, params, router, guestEventId, suggestion, t]);

  // Back from login with ?message=<orgId>: open straight away.
  const autoOpened = React.useRef(false);
  React.useEffect(() => {
    if (!autoOpened.current && params.get('message') === orgId) {
      autoOpened.current = true;
      void begin();
    }
  }, [params, orgId, begin]);

  async function send(acknowledge: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await startChat({
        context: guestEventId ? 'GUEST_ENQUIRY' : 'PROFILE',
        toOrgId: orgId,
        ...(guestEventId ? { eventId: guestEventId } : eventId ? { eventId } : {}),
        firstMessage: {
          clientMessageId: newClientMessageId(),
          body,
          ...(acknowledge ? { acknowledgeContactWarning: true } : {}),
        },
      });
      if (result.ok) {
        router.push(`/inbox/${result.data.threadId}`);
        return;
      }
      const key = Object.values(result.fieldErrors ?? {}).flat()[0];
      if (key === 'contactWarning') setWarning(true);
      else if (key && t.has(`errors.${key}`)) setError(t(`errors.${key}`));
      else if (result.code === 'RATE_LIMITED') setError(t('errors.rateLimited'));
      else setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  const label = t('messageBusiness', { name: orgName });
  return (
    <>
      <Button
        variant={variant}
        fullWidth
        onClick={() => void begin()}
        iconLeft={<MessageCircle aria-hidden className="size-5" />}
      >
        {t('messageCta')}
      </Button>
      {open && context && (
        <ResponsiveDialog
          open
          onOpenChange={setOpen}
          title={label}
          footer={
            context.own ? undefined : (
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  {t('cancel')}
                </Button>
                <Button loading={busy} disabled={!body.trim()} onClick={() => void send(warning)}>
                  {warning ? t('sendAnyway') : t('send')}
                </Button>
              </div>
            )
          }
        >
          {context.own ? (
            <p className="text-muted">{t('ownBusiness')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {!guestEventId && context.events.length > 0 && (
                <Select
                  label={t('aboutEvent')}
                  value={eventId}
                  options={[
                    ...context.events.map((event) => ({
                      value: event.id,
                      label: event.date ? `${event.name} · ${event.date}` : event.name,
                    })),
                    { value: '', label: t('noEvent') },
                  ]}
                  onValueChange={(value) => {
                    setEventId(value);
                    setBody(suggestion(context.events.find((event) => event.id === value)));
                  }}
                />
              )}
              <Textarea
                aria-label={t('composerLabel')}
                rows={4}
                maxLength={4000}
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                  setWarning(false);
                }}
              />
              {warning && (
                <Banner tone="warning" title={t('contactWarningTitle')}>
                  {t('contactWarningBody')}
                </Banner>
              )}
              {error && <Banner tone="danger">{error}</Banner>}
            </div>
          )}
        </ResponsiveDialog>
      )}
    </>
  );
}
