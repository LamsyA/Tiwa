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
  vendorName: string;
  vendorPhone: string | null;
  diffMinor: string;
  newBalanceMinor: string;
  currency: string;
  url: string;
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
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

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

        {/* Step 3: share each approve link on WhatsApp */}
        {sent && (
          <ul className="flex flex-col gap-2">
            {sent.map((row) => (
              <li
                key={row.bookingId}
                className="border-border/70 bg-surface flex flex-col gap-2 rounded-2xl border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{row.vendorName}</span>
                  <StatusPill tone="brand">{t('waiting')}</StatusPill>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={waLink(row.vendorPhone, message(row))}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-sm font-semibold text-white transition hover:brightness-105"
                  >
                    <MessageCircle aria-hidden className="size-4" />
                    {t('whatsapp')}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(message(row)).then(() => setCopied(row.bookingId));
                    }}
                    className="border-border/70 hover:bg-surface-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition"
                  >
                    {copied === row.bookingId ? (
                      <Check aria-hidden className="size-4" />
                    ) : (
                      <Copy aria-hidden className="size-4" />
                    )}
                    {copied === row.bookingId ? t('copied') : t('copy')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ResponsiveDialog>
  );
}
