'use client';

import type { BatchPreview } from '@tiwa/core';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Chip,
  FieldShell,
  Input,
  ResponsiveDialog,
  Select,
  Stepper,
  Switch,
  Textarea,
} from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { ActionResult } from '@/lib/action.js';
import { createBatchAction, sendBatchAction } from './actions.js';

export interface ComposerGuest {
  id: string;
  name: string;
}

export interface ComposerGroup {
  id: string;
  name: string;
}

type Channel = 'WHATSAPP' | 'EMAIL' | 'SMS' | 'LINK';

export function Composer({
  eventId,
  eventName,
  whenText = '',
  venueName = '',
  currency,
  appUrl,
  guests,
  groups,
}: {
  eventId: string;
  eventName: string;
  whenText?: string;
  venueName?: string;
  currency: string;
  appUrl: string;
  guests: ComposerGuest[];
  groups: ComposerGroup[];
}) {
  const t = useTranslations('events.invites.composer');
  const te = useTranslations('events.invites.errors');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [kind, setKind] = React.useState<'INVITE' | 'UPDATE'>('INVITE');
  const [who, setWho] = React.useState<'all' | 'attending' | 'group' | 'ids'>('all');
  const [groupId, setGroupId] = React.useState('');
  const [picked, setPicked] = React.useState<string[]>([]);
  const [channels, setChannels] = React.useState<Channel[]>(['WHATSAPP', 'EMAIL', 'SMS']);
  const [smart, setSmart] = React.useState(true);
  const [message, setMessage] = React.useState('');
  const [template, setTemplate] = React.useState('warm');
  const [editing, setEditing] = React.useState(false);
  const messageRef = React.useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [preview, setPreview] = React.useState<BatchPreview | undefined>();
  const [sent, setSent] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const idempotencyKey = React.useRef('');

  function reset() {
    setStep(0);
    setKind('INVITE');
    setWho('all');
    setGroupId('');
    setPicked([]);
    setChannels(['WHATSAPP', 'EMAIL', 'SMS']);
    setSmart(true);
    setMessage('');
    setPreview(undefined);
    setSent(false);
    setError(undefined);
    idempotencyKey.current = '';
  }

  function fail(result: Extract<ActionResult<unknown>, { ok: false }>) {
    try {
      setError(te(result.code));
    } catch {
      setError(te('generic'));
    }
  }

  const details =
    (whenText ? t('templates.detailsWhen', { when: whenText }) : '') +
    (venueName ? t('templates.detailsWhere', { where: venueName }) : '');
  const TEMPLATES = { INVITE: ['warm', 'formal', 'short'], UPDATE: ['reminder', 'change', 'thanks'] } as const;

  function templateText(nextKind: 'INVITE' | 'UPDATE', key: string): string {
    return t(`templates.${nextKind}.${key}.body` as 'templates.INVITE.warm.body', { event: eventName, details });
  }

  function defaultMessage(nextKind: 'INVITE' | 'UPDATE'): string {
    const key = TEMPLATES[nextKind][0];
    setTemplate(key);
    setEditing(false);
    return templateText(nextKind, key);
  }

  /** Drop {name} / {link} in at the cursor, so nobody has to type the placeholders. */
  function insertToken(token: string) {
    const el = messageRef.current;
    const start = el?.selectionStart ?? message.length;
    const end = el?.selectionEnd ?? message.length;
    const next = `${message.slice(0, start)}${token}${message.slice(end)}`;
    setMessage(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function openComposer() {
    reset();
    setMessage(defaultMessage('INVITE'));
    idempotencyKey.current = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
    setOpen(true);
  }

  function toggleChannel(channel: Channel) {
    setChannels((current) =>
      current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel],
    );
  }

  async function review() {
    setBusy(true);
    setError(undefined);
    const audience =
      who === 'group'
        ? { type: 'group' as const, groupId }
        : who === 'ids'
          ? { type: 'ids' as const, guestIds: picked }
          : who === 'attending'
            ? { type: 'attending' as const }
            : { type: 'all' as const };
    const result = await createBatchAction({ eventId, audience, channels, smart, message, kind });
    setBusy(false);
    if (!result.ok) {
      fail(result);
      return;
    }
    setPreview(result.data);
    setStep(3);
  }

  async function send() {
    if (!preview) return;
    setBusy(true);
    setError(undefined);
    const result = await sendBatchAction({ batchId: preview.batchId, idempotencyKey: idempotencyKey.current });
    setBusy(false);
    if (!result.ok) {
      fail(result);
      return;
    }
    setSent(true);
    router.refresh();
  }

  const whoValid = who === 'group' ? groupId !== '' : who === 'ids' ? picked.length > 0 : true;
  const howValid = channels.length > 0;
  const messageValid = message.trim().length > 0;
  const canNext = step === 0 ? whoValid : step === 1 ? howValid : step === 2 ? messageValid : true;
  const sampleLink = `${appUrl}/i/sample-token-for-preview`;
  const sampleName = guests[0]?.name.split(' ')[0] ?? 'Ada';
  const rendered = message
    .replaceAll('{name}', sampleName)
    .replaceAll('{link}', sampleLink)
    .replaceAll('{event}', eventName);
  const smsCount = rendered.length <= 160 ? 1 : Math.ceil(rendered.length / 153);
  const cost = preview ? formatMinor(preview.smsEstimateMinor, currency) : '';
  const visibleGuests = guests.filter((guest) => guest.name.toLowerCase().includes(query.toLowerCase())).slice(0, 200);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? openComposer() : setOpen(false))}
      trigger={<Button onClick={openComposer}>{t('new')}</Button>}
      title={t('title')}
    >
      <div className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}
        {sent && preview ? (
          <Banner tone="info">{t('review.sent')}</Banner>
        ) : (
          <>
            <Stepper
              steps={[
                { label: t('steps.who') },
                { label: t('steps.how') },
                { label: t('steps.message') },
                { label: t('steps.review') },
              ]}
              active={step}
            />
            {step === 0 && (
              <div className="flex flex-col gap-3">
                <Select
                  label={t('kind.label')}
                  value={kind}
                  options={[
                    { value: 'INVITE', label: t('kind.invite') },
                    { value: 'UPDATE', label: t('kind.update') },
                  ]}
                  onValueChange={(value) => {
                    const nextKind = value as 'INVITE' | 'UPDATE';
                    setKind(nextKind);
                    setMessage(defaultMessage(nextKind));
                    if (nextKind === 'UPDATE' && who === 'all') setWho('attending');
                    if (nextKind === 'INVITE' && who === 'attending') setWho('all');
                  }}
                />
                <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('steps.who')}>
                  {(['all', 'attending', 'group', 'ids'] as const).map((option) => (
                    <label
                      key={option}
                      className="border-border flex cursor-pointer items-center gap-2 rounded-md border p-3"
                    >
                      <input
                        type="radio"
                        name="who"
                        checked={who === option}
                        onChange={() => setWho(option)}
                        className="size-4"
                      />
                      <span className="text-sm font-medium">{t(`who.${option}`)}</span>
                    </label>
                  ))}
                </div>
                {who === 'group' && (
                  <Select
                    label={t('who.groupLabel')}
                    value={groupId}
                    options={[
                      { value: '', label: '—' },
                      ...groups.map((group) => ({ value: group.id, label: group.name })),
                    ]}
                    onValueChange={setGroupId}
                  />
                )}
                {who === 'ids' && (
                  <div className="flex flex-col gap-2">
                    <Input
                      aria-label={t('who.pickPlaceholder')}
                      placeholder={t('who.pickPlaceholder')}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    <p className="text-muted text-sm">{t('who.picked', { count: picked.length })}</p>
                    <div className="flex max-h-56 flex-col gap-1 overflow-auto">
                      {visibleGuests.map((guest) => (
                        <label
                          key={guest.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-surface"
                        >
                          <Checkbox
                            checked={picked.includes(guest.id)}
                            onCheckedChange={(checked) =>
                              setPicked((current) =>
                                checked ? [...current, guest.id] : current.filter((id) => id !== guest.id),
                              )
                            }
                            aria-label={guest.name}
                          />
                          <span className="text-sm">{guest.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {step === 1 && (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="mb-2 text-sm font-medium">{t('how.channels')}</p>
                  <div className="flex flex-wrap gap-2">
                    {(['WHATSAPP', 'EMAIL', 'SMS', 'LINK'] as const).map((channel) => (
                      <Chip key={channel} selected={channels.includes(channel)} onClick={() => toggleChannel(channel)}>
                        {t(`how.${channel.toLowerCase()}`)}
                      </Chip>
                    ))}
                  </div>
                </div>
                <label className="flex cursor-pointer items-start gap-2">
                  <Switch checked={smart} onCheckedChange={setSmart} aria-label={t('how.smart')} />
                  <span>
                    <span className="block text-sm font-medium">{t('how.smart')}</span>
                    <span className="text-muted block text-sm">{smart ? t('how.smartHint') : t('how.manualHint')}</span>
                  </span>
                </label>
              </div>
            )}
            {step === 2 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="font-display text-lg font-bold">{t('templates.heading')}</h3>
                  <p className="text-muted text-sm">{t('templates.sub')}</p>
                </div>
                <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('templates.heading')}>
                  {TEMPLATES[kind].map((key) => {
                    const body = templateText(kind, key);
                    const selected = !editing && template === key && message === body;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          setTemplate(key);
                          setMessage(body);
                          setEditing(false);
                        }}
                        className={
                          'rounded-2xl border p-3 text-left transition ' +
                          (selected
                            ? 'border-brand bg-brand-soft/40 ring-brand/30 ring-2'
                            : 'border-border hover:border-brand/50 hover:bg-surface')
                        }
                      >
                        <span className="text-brand-strong text-xs font-semibold tracking-wide uppercase">
                          {t(`templates.${kind}.${key}.title` as 'templates.INVITE.warm.title')}
                        </span>
                        <span className="mt-1 block text-sm leading-relaxed">
                          {body.replaceAll('{name}', sampleName).replaceAll('{link}', '🔗')}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="bg-surface-2 flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 text-sm">
                  <span className="font-medium">{t('templates.personalised')}:</span>
                  <Chip>✓ {t('templates.nameTag')}</Chip>
                  <Chip>✓ {t('templates.linkTag')}</Chip>
                </div>
                {editing ? (
                  <div className="flex flex-col gap-2">
                    <FieldShell id="composer-message" label={t('message.label')} hint={t('message.hint')}>
                      {(describedBy) => (
                        <Textarea
                          id="composer-message"
                          ref={messageRef}
                          aria-describedby={describedBy}
                          rows={5}
                          value={message}
                          onChange={(event) => setMessage(event.target.value)}
                        />
                      )}
                    </FieldShell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted text-xs">{t('templates.insertHint')}</span>
                      <Chip onClick={() => insertToken('{name}')}>+ {t('templates.insertName')}</Chip>
                      <Chip onClick={() => insertToken('{link}')}>+ {t('templates.insertLink')}</Chip>
                      <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setEditing(false)}>
                        {t('templates.doneEditing')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="secondary" size="sm" className="w-fit" onClick={() => setEditing(true)}>
                    {t('templates.edit')}
                  </Button>
                )}
                <Card className="p-3">
                  <p className="text-muted mb-2 text-xs font-medium uppercase">
                    {t('templates.previewFor', { name: sampleName })}
                  </p>
                  <p className="inline-block max-w-full rounded-2xl rounded-tl-sm bg-[#dcf8c6] p-2.5 text-sm break-words whitespace-pre-wrap text-black">
                    {rendered}
                  </p>
                  {channels.includes('SMS') && (
                    <p className="text-muted mt-2 text-xs">{t('message.segments', { count: smsCount })}</p>
                  )}
                  {channels.includes('EMAIL') && <p className="text-muted mt-1 text-xs">{t('message.emailNote')}</p>}
                </Card>
              </div>
            )}
            {step === 3 && preview && (
              <div className="flex flex-col gap-3">
                <h3 className="font-medium">{t('review.title')}</h3>
                <Card className="flex flex-col gap-1 p-3">
                  <p className="mb-1 text-xs font-medium uppercase">{t('review.perChannel')}</p>
                  {(['WHATSAPP', 'EMAIL', 'SMS', 'LINK'] as const).map(
                    (channel) =>
                      preview.counts[channel] > 0 && (
                        <div key={channel} className="flex items-baseline justify-between gap-2 py-0.5">
                          <span className="text-sm">{t(`how.${channel.toLowerCase()}`)}</span>
                          <span className="font-medium tabular-nums">{preview.counts[channel]}</span>
                        </div>
                      ),
                  )}
                  <div className="flex items-baseline justify-between gap-2 py-0.5">
                    <span className="text-sm">{t('review.cost')}</span>
                    <span className="font-medium tabular-nums">
                      {preview.smsEstimateMinor === 0 ? t('review.free') : cost}
                    </span>
                  </div>
                </Card>
                {preview.needsLink.length > 0 && (
                  <Card className="flex flex-col gap-2 p-3">
                    <p className="text-sm font-medium">
                      {t('review.needsLink')} ({preview.needsLink.length})
                    </p>
                    <p className="text-muted text-sm">{t('review.needsLinkHint')}</p>
                    <div className="flex max-h-40 flex-col gap-1 overflow-auto">
                      {preview.needsLink.map((row) => (
                        <NeedLinkRow key={row.id} name={row.name} url={`${appUrl}/i/${row.token}`} />
                      ))}
                    </div>
                  </Card>
                )}
                {preview.total === 0 && <Banner tone="warning">{t('review.empty')}</Banner>}
              </div>
            )}
            <div className="flex gap-2">
              {step > 0 && step < 3 && (
                <Button variant="secondary" onClick={() => setStep(step - 1)}>
                  {t('back')}
                </Button>
              )}
              {step < 2 && (
                <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
                  {t('next')}
                </Button>
              )}
              {step === 2 && (
                <Button disabled={!canNext || busy} loading={busy} onClick={() => void review()}>
                  {t('next')}
                </Button>
              )}
              {step === 3 && preview && preview.total > 0 && (
                <Button loading={busy} onClick={() => void send()}>
                  {t('review.send', { count: preview.total })}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}

function NeedLinkRow({ name, url }: { name: string; url: string }) {
  const t = useTranslations('events.invites.composer');
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center gap-2">
      <p className="min-w-0 flex-1 truncate text-sm">{name}</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(() => setCopied(true));
        }}
      >
        {copied ? t('review.copied') : t('review.copy')}
      </Button>
    </div>
  );
}

function formatMinor(minor: number, currency: string): string {
  try {
    const digits =
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    const major = minor / 10 ** digits;
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: digits }).format(major);
  } catch {
    return `${minor}`;
  }
}
