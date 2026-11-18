'use client';

import type { ProgrammeRow } from '@tiwa/core';
import { Button, ConfirmDialog, FieldShell, Input, QRCode, ResponsiveDialog, Textarea, cn } from '@tiwa/ui';
import { Check, Copy, ExternalLink, Pencil, Plus, Printer, QrCode, Trash2, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  KIND_ICON,
  KIND_TINT,
  KindIcon,
  PROGRAMME_KIND_LIST,
  asKind,
  type Kind,
} from '@/components/programme/kinds.js';
import { deleteProgrammeAction, saveProgrammeAction } from './actions.js';

interface Draft {
  itemId?: string;
  kind: Kind;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  who: string;
  description: string;
}

/**
 * D-X92: the host's programme builder. Phone first: a timeline of the day,
 * one sheet to add or edit anything, and the guest link + a QR to print for
 * the venue (one QR instead of a stack of printed programmes).
 */
export function ProgrammeEditor({
  eventId,
  eventName,
  isDraft,
  days,
  items,
  guestUrl,
  canEdit,
}: {
  eventId: string;
  eventName: string;
  isDraft: boolean;
  days: string[];
  items: ProgrammeRow[];
  guestUrl: string;
  canEdit: boolean;
}) {
  const t = useTranslations('programme');
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [showQr, setShowQr] = React.useState(false);

  const firstDay = days[0] ?? '';
  const multiDay = days.length > 1;
  const dayLabel = (date: string) =>
    new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
      new Date(`${date}T12:00:00Z`),
    );
  const clock = (value: string | null) => {
    if (!value) return '';
    const [h, m] = value.split(':').map(Number);
    const d = new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0));
    return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(d);
  };

  function blank(): Draft {
    const last = items[items.length - 1];
    // Suggest the next slot right after the last item.
    let start = '12:00';
    if (last?.endTime) start = last.endTime;
    else if (last?.startTime) {
      const [h, m] = last.startTime.split(':').map(Number);
      const mins = ((h ?? 0) * 60 + (m ?? 0) + 15) % (24 * 60);
      start = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    }
    return {
      kind: 'speech',
      title: '',
      date: last?.date ?? firstDay,
      startTime: start,
      endTime: '',
      who: '',
      description: '',
    };
  }

  function edit(row: ProgrammeRow) {
    setError(null);
    setDraft({
      itemId: row.id,
      kind: asKind(row.kind),
      title: row.title,
      date: row.date ?? firstDay,
      startTime: row.startTime ?? '12:00',
      endTime: row.endTime ?? '',
      who: row.who,
      description: row.description,
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim()) return setError(t('titleRequired'));
    setSaving(true);
    setError(null);
    const result = await saveProgrammeAction({
      eventId,
      ...(draft.itemId ? { itemId: draft.itemId } : {}),
      title: draft.title,
      kind: draft.kind,
      ...(draft.date ? { date: draft.date } : {}),
      startTime: draft.startTime,
      endTime: draft.endTime,
      who: draft.who,
      description: draft.description,
    }).catch(() => null);
    setSaving(false);
    if (!result?.ok) {
      const key = result && !result.ok ? Object.values(result.fieldErrors ?? {})[0]?.[0] : undefined;
      return setError(key === 'noEventDate' ? t('noDate') : t('failed'));
    }
    setDraft(null);
    router.refresh();
  }

  async function remove(itemId: string) {
    await deleteProgrammeAction({ eventId, itemId });
    router.refresh();
  }

  const byDay = new Map<string, ProgrammeRow[]>();
  for (const row of items) {
    const key = row.date ?? firstDay;
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }

  return (
    <div className="flex flex-col gap-5 py-2">
      {/* Share card */}
      <section className="from-brand-strong relative isolate overflow-hidden rounded-3xl bg-gradient-to-br to-[#2a1210] p-5 text-white shadow-[var(--shadow-2)] sm:p-6">
        <div aria-hidden className="absolute -top-16 -right-10 -z-10 size-56 rounded-full bg-white/10 blur-2xl" />
        <p className="text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">{t('eyebrow')}</p>
        <h2 className="font-display mt-1 text-2xl font-bold tracking-tight">{t('heading')}</h2>
        <p className="mt-1 max-w-md text-sm text-white/80">{t('lead')}</p>
        {isDraft && <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-white/90">{t('draftNote')}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(guestUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            className="text-brand-strong inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold transition hover:bg-white/90"
          >
            {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
            {copied ? t('copied') : t('copyLink')}
          </button>
          <a
            href={guestUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-white/12 px-4 text-sm font-semibold ring-1 ring-white/25 transition hover:bg-white/20"
          >
            <ExternalLink aria-hidden className="size-4" />
            {t('preview')}
          </a>
          <button
            type="button"
            onClick={() => setShowQr((v) => !v)}
            aria-expanded={showQr}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-white/12 px-4 text-sm font-semibold ring-1 ring-white/25 transition hover:bg-white/20"
          >
            <QrCode aria-hidden className="size-4" />
            {t('venueQr')}
          </button>
        </div>
        {showQr && (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl bg-white p-5 text-center text-[#1c1917] sm:flex-row sm:text-left">
            <QRCode
              value={guestUrl}
              size={150}
              label={t('qrLabel', { event: eventName })}
              className="w-[150px] shrink-0"
            />
            <div className="flex flex-col gap-2">
              <p className="font-display text-lg font-bold">{t('qrTitle')}</p>
              <p className="text-sm text-[#57534e]">{t('qrBody')}</p>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-9 items-center gap-2 self-center rounded-full bg-[#1c1917] px-4 text-sm font-semibold text-white sm:self-start"
              >
                <Printer aria-hidden className="size-4" />
                {t('printQr')}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Timeline */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold tracking-tight">{t('orderOfDay')}</h2>
          {canEdit && items.length > 0 && (
            <Button
              className="rounded-full"
              onClick={() => {
                setError(null);
                setDraft(blank());
              }}
            >
              <Plus aria-hidden className="size-4" />
              {t('add')}
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="border-border/80 bg-surface flex flex-col items-center gap-3 rounded-3xl border border-dashed px-6 py-12 text-center">
            <div className="flex -space-x-2">
              {(['prayer', 'speech', 'music', 'meal'] as const).map((k) => (
                <KindIcon key={k} kind={k} className="ring-surface size-11 ring-4" />
              ))}
            </div>
            <h3 className="font-display text-lg font-bold">{t('emptyTitle')}</h3>
            <p className="text-muted max-w-sm text-sm">{t('emptyBody')}</p>
            {canEdit && (
              <Button
                className="mt-1 rounded-full"
                onClick={() => {
                  setError(null);
                  setDraft(blank());
                }}
              >
                <Plus aria-hidden className="size-4" />
                {t('addFirst')}
              </Button>
            )}
          </div>
        ) : (
          [...byDay.entries()].map(([date, rows]) => (
            <div key={date} className="flex flex-col gap-2">
              {multiDay && date && (
                <p className="text-muted px-1 text-xs font-semibold tracking-wide uppercase">{dayLabel(date)}</p>
              )}
              <ol className="border-border/70 bg-surface divide-border/60 divide-y overflow-hidden rounded-3xl border shadow-[var(--shadow-1)]">
                {rows.map((row) => (
                  <li key={row.id} className="group flex items-start gap-3 px-4 py-4 sm:px-5">
                    <div className="w-16 shrink-0 pt-0.5 text-right">
                      <p className="font-display text-sm font-bold tabular-nums">{clock(row.startTime)}</p>
                      {row.endTime && <p className="text-muted text-xs tabular-nums">{clock(row.endTime)}</p>}
                    </div>
                    <KindIcon kind={row.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="leading-snug font-semibold">{row.title}</p>
                      {row.who && (
                        <p className="text-muted mt-0.5 flex items-center gap-1 text-sm">
                          <Users aria-hidden className="size-3.5" />
                          {row.who}
                        </p>
                      )}
                      {row.description && <p className="text-muted mt-1 text-sm">{row.description}</p>}
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 gap-1 opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => edit(row)}
                          aria-label={t('editItem', { title: row.title })}
                          className="text-muted hover:bg-surface-2 hover:text-text grid size-9 place-items-center rounded-xl transition"
                        >
                          <Pencil aria-hidden className="size-4" />
                        </button>
                        <ConfirmDialog
                          trigger={
                            <button
                              type="button"
                              aria-label={t('deleteItem', { title: row.title })}
                              className="text-muted hover:bg-danger-soft hover:text-danger grid size-9 place-items-center rounded-xl transition"
                            >
                              <Trash2 aria-hidden className="size-4" />
                            </button>
                          }
                          title={t('deleteTitle')}
                          body={t('deleteBody', { title: row.title })}
                          confirmLabel={t('delete')}
                          destructive
                          onConfirm={() => void remove(row.id)}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </section>

      {/* Add / edit sheet */}
      <ResponsiveDialog
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
        title={draft?.itemId ? t('editTitle') : t('addTitle')}
        description={t('sheetLead')}
      >
        {draft && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="text-muted mb-1 text-xs font-medium">{t('kindLabel')}</legend>
              <div className="flex flex-wrap gap-1.5">
                {PROGRAMME_KIND_LIST.map((k) => {
                  const Icon = KIND_ICON[k];
                  const on = draft.kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDraft({ ...draft, kind: k })}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 transition',
                        on ? 'bg-text text-bg ring-transparent' : 'bg-surface ring-border hover:bg-surface-2',
                      )}
                    >
                      <span className={cn('grid size-5 place-items-center rounded-full', on ? '' : KIND_TINT[k])}>
                        <Icon aria-hidden className="size-3" />
                      </span>
                      {t(`kind.${k}`)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <FieldShell id="prog-title" label={t('titleLabel')}>
              {(describedBy) => (
                <Input
                  id="prog-title"
                  aria-describedby={describedBy}
                  placeholder={t(`placeholder.${draft.kind}`)}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  autoFocus
                />
              )}
            </FieldShell>
            {multiDay && (
              <FieldShell id="prog-day" label={t('dayLabel')}>
                {(describedBy) => (
                  <select
                    id="prog-day"
                    aria-describedby={describedBy}
                    value={draft.date}
                    onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                    className="border-border bg-surface h-11 rounded-xl border px-3 text-sm"
                  >
                    {days.map((day) => (
                      <option key={day} value={day}>
                        {dayLabel(day)}
                      </option>
                    ))}
                  </select>
                )}
              </FieldShell>
            )}
            <div className="grid grid-cols-2 gap-3">
              <FieldShell id="prog-start" label={t('startLabel')}>
                {(describedBy) => (
                  <Input
                    id="prog-start"
                    type="time"
                    required
                    aria-describedby={describedBy}
                    value={draft.startTime}
                    onChange={(event) => setDraft({ ...draft, startTime: event.target.value })}
                  />
                )}
              </FieldShell>
              <FieldShell id="prog-end" label={t('endLabel')}>
                {(describedBy) => (
                  <Input
                    id="prog-end"
                    type="time"
                    aria-describedby={describedBy}
                    value={draft.endTime}
                    onChange={(event) => setDraft({ ...draft, endTime: event.target.value })}
                  />
                )}
              </FieldShell>
            </div>
            <FieldShell id="prog-who" label={t('whoLabel')} hint={t('whoHint')}>
              {(describedBy) => (
                <Input
                  id="prog-who"
                  aria-describedby={describedBy}
                  value={draft.who}
                  onChange={(event) => setDraft({ ...draft, who: event.target.value })}
                />
              )}
            </FieldShell>
            <FieldShell id="prog-desc" label={t('descLabel')}>
              {(describedBy) => (
                <Textarea
                  id="prog-desc"
                  rows={3}
                  aria-describedby={describedBy}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              )}
            </FieldShell>
            {error && (
              <p role="alert" className="text-danger text-sm">
                {error}
              </p>
            )}
            <Button type="submit" disabled={saving} className="h-12 rounded-2xl text-base">
              {saving ? t('saving') : draft.itemId ? t('saveChanges') : t('addToProgramme')}
            </Button>
          </form>
        )}
      </ResponsiveDialog>
    </div>
  );
}
