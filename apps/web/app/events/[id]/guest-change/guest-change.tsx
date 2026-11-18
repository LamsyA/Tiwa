'use client';

import type { GuestChangePreview } from '@tiwa/core';
import { Banner, Button, Input, MoneyText, ResponsiveDialog, StatusPill } from '@tiwa/ui';
import { ArrowRight, Check, Copy, MessageCircle, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { previewGuestChange, sendGuestChange } from './actions.js';

interface SentRow {
  bookingId: string;
  versionId: string;
  vendorName: string;
  vendorPhone: string | null;
  diffMinor: string;
  newBalanceMinor: string;
  currency: string;
  url: string;
}

/** One WhatsApp message to send: a vendor's approve link, or the planner's heads-up (D-X89). */
interface Recipient {
  key: string;
  name: string;
  phone: string | null;
  text: string;
  kind: 'vendor' | 'planner';
}

/** wa.me wants digits only, with the country code. */
function waLink(phone: string | null, text: string): string {
  const digits = phone?.replace(/\D/g, '') ?? '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * D-X84 showcase: the guest count changes, Tiwa drafts the change for every
 * per-guest booking, the planner sends it, and each vendor approves from a
 * WhatsApp link. Three steps: count → review → send and share.
 */
export function GuestChangeFlow({
  eventId,
  eventName,
  currentCount,
  trigger,
}: {
  eventId: string;
  eventName: string;
  currentCount: number | null;
  trigger?: React.ReactNode;
}) {
  const t = useTranslations('guestChange');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [count, setCount] = React.useState(String(currentCount ?? ''));
  const [preview, setPreview] = React.useState<GuestChangePreview | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [sent, setSent] = React.useState<SentRow[] | null>(null);
  const [planner, setPlanner] = React.useState<{ name: string; phone: string | null; url: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  // D-X85 "Send all on WhatsApp": shared vendors, and the one whose chat is open now.
  const [shared, setShared] = React.useState<Set<string>>(new Set());
  const [opening, setOpening] = React.useState<string | null>(null);

  // Browsers only open WhatsApp from a tap, so the queue steps one vendor per tap.
  // When the planner comes back from WhatsApp, the vendor just opened counts as shared.
  React.useEffect(() => {
    if (!opening) return;
    const onBack = () => {
      if (document.visibilityState !== 'visible') return;
      setShared((current) => new Set(current).add(opening));
      setOpening(null);
    };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, [opening]);

  // Progress survives closing the sheet or a reload (keyed by this batch of changes).
  const batchKey = sent ? `tiwa:gc-shared:${sent.map((row) => row.versionId).join(',')}` : null;
  React.useEffect(() => {
    if (!batchKey) return;
    try {
      window.localStorage.setItem(batchKey, JSON.stringify([...shared]));
    } catch {
      // Storage blocked.
    }
  }, [batchKey, shared]);

  function openWhatsApp(row: Recipient) {
    setOpening(row.key);
    window.open(waLink(row.phone, row.text), '_blank', 'noopener');
  }

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setPreview(null);
      setSent(null);
      setError(null);
      if (sent) router.refresh();
    }
  }

  async function check() {
    const value = Number(count);
    if (!Number.isInteger(value) || value < 1) return setError(t('countInvalid'));
    setBusy(true);
    setError(null);
    const result = await previewGuestChange({ eventId, newCount: value });
    setBusy(false);
    if (!result.ok) return setError(t('failed'));
    setPreview(result.data);
    setPicked(new Set(result.data.affected.filter((row) => !row.blocked).map((row) => row.bookingId)));
  }

  async function send() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const result = await sendGuestChange({ eventId, newCount: preview.toCount, bookingIds: [...picked] });
    setBusy(false);
    if (!result.ok) return setError(t('failed'));
    // Resume a half-shared batch (same changes) after a reload.
    try {
      const key = `tiwa:gc-shared:${result.data.sent.map((row) => row.versionId).join(',')}`;
      const saved = window.localStorage.getItem(key);
      setShared(new Set(saved ? (JSON.parse(saved) as string[]) : []));
    } catch {
      setShared(new Set());
    }
    setPlanner(result.data.planner);
    setSent(result.data.sent);
  }

  const message = (row: SentRow) =>
    t('waMessage', {
      vendor: row.vendorName,
      event: eventName,
      from: preview?.fromCount ?? 0,
      to: preview?.toCount ?? 0,
      url: row.url,
    });

  // Affected vendors first, then the planner (D-X89).
  const recipients: Recipient[] = sent
    ? [
        ...sent.map((row) => ({
          key: row.bookingId,
          name: row.vendorName,
          phone: row.vendorPhone,
          text: message(row),
          kind: 'vendor' as const,
        })),
        ...(planner
          ? [
              {
                key: 'planner',
                name: planner.name,
                phone: planner.phone,
                text: t('waPlanner', {
                  planner: planner.name,
                  event: eventName,
                  from: preview?.fromCount ?? 0,
                  to: preview?.toCount ?? 0,
                  vendors: sent.map((row) => row.vendorName).join(', ') || '—',
                  url: planner.url,
                }),
                kind: 'planner' as const,
              },
            ]
          : []),
      ]
    : [];

  const totalDiff = preview
    ? preview.affected.filter((row) => picked.has(row.bookingId)).reduce((sum, row) => sum + BigInt(row.diffMinor), 0n)
    : 0n;
  const currency = preview?.affected[0]?.currency ?? 'NGN';

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={reset}
      trigger={
        trigger ?? (
          <Button variant="secondary" className="rounded-full">
            <Users aria-hidden className="size-4" />
            {t('trigger')}
          </Button>
        )
      }
      title={sent ? t('sentTitle', { count: sent.length }) : t('title')}
      description={sent ? t('sentBody') : t('subtitle')}
    >
      <div className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}

        {/* Step 1: the new count */}
        {!sent && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="guest-change-count" className="text-muted mb-1 block text-xs font-medium">
                {t('newCount', { current: currentCount ?? 0 })}
              </label>
              <Input
                id="guest-change-count"
                type="number"
                inputMode="numeric"
                min={1}
                value={count}
                onChange={(event) => {
                  setCount(event.target.value);
                  setPreview(null);
                }}
              />
            </div>
            <Button variant={preview ? 'secondary' : 'primary'} loading={busy && !preview} onClick={() => void check()}>
              {preview ? t('recheck') : t('check')}
            </Button>
          </div>
        )}

        {/* Step 2: what changes, vendor by vendor */}
        {preview && !sent && (
          <>
            {preview.affected.length === 0 ? (
              <p className="bg-surface-2 rounded-2xl p-4 text-sm">{t('nothing')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {preview.affected.map((row) => {
                  const on = picked.has(row.bookingId);
                  const up = BigInt(row.diffMinor) >= 0n;
                  return (
                    <li key={row.bookingId}>
                      <label
                        className={`flex cursor-pointer gap-3 rounded-2xl border p-3 transition ${
                          on ? 'border-brand/50 bg-brand-soft/30' : 'border-border/70 bg-surface'
                        } ${row.blocked ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="accent-[var(--brand)] mt-1 size-4 shrink-0"
                          checked={on}
                          disabled={row.blocked !== null}
                          onChange={(event) =>
                            setPicked((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(row.bookingId);
                              else next.delete(row.bookingId);
                              return next;
                            })
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold">{row.vendorName}</span>
                            <span
                              className={`shrink-0 text-sm font-bold tabular-nums ${up ? 'text-brand-strong' : 'text-success'}`}
                            >
                              {up ? '+' : '−'}
                              <MoneyText value={row.diffMinor.replace('-', '')} currency={row.currency} />
                            </span>
                          </span>
                          {row.lines.map((line) => (
                            <span key={line.name} className="text-muted flex items-center gap-1 text-xs">
                              <span className="truncate">{line.name}</span>
                              <span className="shrink-0 tabular-nums">
                                {line.from} <ArrowRight aria-hidden className="inline size-3" /> {line.to}
                              </span>
                            </span>
                          ))}
                          <span className="text-muted mt-1 block text-xs">
                            {t('newBalance')}{' '}
                            <span className="text-text font-semibold">
                              <MoneyText value={row.newBalanceMinor} currency={row.currency} />
                            </span>
                          </span>
                          {row.blocked && (
                            <StatusPill tone="warning" className="mt-1">
                              {t('blocked')}
                            </StatusPill>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {preview.unaffected.length > 0 && (
              <p className="text-muted text-xs">
                {t('unaffected', { names: preview.unaffected.map((row) => row.vendorName).join(', ') })}
              </p>
            )}
            {preview.affected.length > 0 && (
              <div className="bg-surface-2 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm">
                <span className="text-muted">{t('totalChange')}</span>
                <span className="font-display text-lg font-bold tabular-nums">
                  {totalDiff >= 0n ? '+' : '−'}
                  <MoneyText value={(totalDiff < 0n ? -totalDiff : totalDiff).toString()} currency={currency} />
                </span>
              </div>
            )}
            <Button
              className="h-12 rounded-2xl"
              loading={busy}
              disabled={picked.size === 0 && preview.affected.length > 0}
              onClick={() => void send()}
            >
              {preview.affected.length === 0 ? t('justUpdate') : t('send', { count: picked.size })}
            </Button>
            <p className="text-muted text-xs">{t('note')}</p>
          </>
        )}

        {/* Step 3: share each approve link on WhatsApp, one tap per vendor (D-X85). */}
        {recipients.length > 0 &&
          (() => {
            const next = recipients.find((row) => !shared.has(row.key)) ?? null;
            const done = recipients.filter((row) => shared.has(row.key)).length;
            return (
              <div className="flex flex-col gap-3">
                <div className="border-border/70 bg-surface flex flex-col gap-3 rounded-2xl border p-4">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold">{t('progress', { done, total: recipients.length })}</span>
                    {done === recipients.length && <StatusPill tone="success">{t('allSent')}</StatusPill>}
                  </div>
                  <div className="bg-surface-2 h-1.5 overflow-hidden rounded-full">
                    <span
                      className="block h-full rounded-full bg-[#25D366] transition-[width] duration-500"
                      style={{ width: `${(done / recipients.length) * 100}%` }}
                    />
                  </div>
                  {next ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openWhatsApp(next)}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 text-base font-semibold text-white shadow-[var(--shadow-1)] transition hover:brightness-105"
                      >
                        <MessageCircle aria-hidden className="size-5" />
                        {done === 0 ? t('sendAll', { count: recipients.length }) : t('sendNext', { vendor: next.name })}
                      </button>
                      <div className="text-muted flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">
                          {opening
                            ? t('tapSend')
                            : next.phone
                              ? t('nextUp', { vendor: next.name })
                              : t('noNumber', { name: next.name })}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setOpening(null);
                            setShared((current) => new Set(current).add(next.key));
                          }}
                          className="hover:text-text shrink-0 font-semibold underline-offset-2 hover:underline"
                        >
                          {t('skip')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-success flex items-center gap-2 text-sm font-semibold">
                      <Check aria-hidden className="size-4" />
                      {t('everyoneHasIt', { count: recipients.length })}
                    </p>
                  )}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {recipients.map((row) => {
                    const isShared = shared.has(row.key);
                    return (
                      <li
                        key={row.key}
                        className="border-border/70 bg-surface flex items-center gap-2 rounded-xl border px-3 py-2"
                      >
                        <span
                          className={`grid size-6 shrink-0 place-items-center rounded-full ${
                            isShared ? 'bg-[#25D366] text-white' : 'bg-surface-2 text-muted'
                          }`}
                        >
                          {isShared ? (
                            <Check aria-hidden className="size-3.5" />
                          ) : (
                            <MessageCircle aria-hidden className="size-3.5" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {row.name}
                          <span className="text-muted ml-1.5 text-xs font-normal">
                            {row.kind === 'planner' ? t('plannerTag') : row.phone ? '' : t('noNumberTag')}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => openWhatsApp(row)}
                          aria-label={t('whatsappFor', { vendor: row.name })}
                          className="text-[#128C7E] hover:bg-surface-2 grid size-8 place-items-center rounded-lg transition"
                        >
                          <MessageCircle aria-hidden className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(row.text).then(() => setCopied(row.key));
                          }}
                          aria-label={t('copyFor', { vendor: row.name })}
                          className="text-muted hover:bg-surface-2 hover:text-text grid size-8 place-items-center rounded-lg transition"
                        >
                          {copied === row.key ? (
                            <Check aria-hidden className="size-4" />
                          ) : (
                            <Copy aria-hidden className="size-4" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}
      </div>
    </ResponsiveDialog>
  );
}
