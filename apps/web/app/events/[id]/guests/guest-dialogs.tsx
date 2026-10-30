'use client';

import type { GuestRow, ParsedGuestRow } from '@tiwa/core';
import { Banner, Button, FieldShell, Input, ProgressBar, ResponsiveDialog, Select, Textarea } from '@tiwa/ui';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import * as React from 'react';
import type { ActionResult } from '@/lib/action.js';
import type { GuestGroupItem } from './guests-manager.js';
import { errorText, raiseMergePrompt } from './guests-manager.js';
import {
  addGuestsAction,
  csvUploadUrl,
  editGuest,
  importCsv,
  mergeGuestsAction,
  previewPaste,
  suggestMapping,
} from './actions.js';
import { revokeInviteAction } from '../invites/actions.js';

function useRun() {
  const te = useTranslations('events.guests.errors');
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  async function run<T>(work: () => Promise<ActionResult<T>>): Promise<T | undefined> {
    setBusy(true);
    setError(undefined);
    try {
      const result = await work();
      if (!result.ok) {
        setError(errorText(te, result));
        return undefined;
      }
      router.refresh();
      return result.data;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error, setError };
}

export function AddGuestDialog({
  eventId,
  groups,
  triggerLabel,
  triggerIcon,
}: {
  eventId: string;
  groups: GuestGroupItem[];
  triggerLabel?: string;
  triggerIcon?: React.ReactNode;
}) {
  const t = useTranslations('events.guests');
  const { run, busy, error } = useRun();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [groupId, setGroupId] = React.useState('');

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button>
          {triggerIcon}
          {triggerLabel ?? t('addAction')}
        </Button>
      }
      title={t('addDialog.title')}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() =>
            addGuestsAction({
              eventId,
              source: 'MANUAL',
              guests: [
                { name, ...(phone ? { phone } : {}), ...(email ? { email } : {}), groupIds: groupId ? [groupId] : [] },
              ],
            }),
          ).then((result) => {
            if (!result) return;
            setOpen(false);
            setName('');
            setPhone('');
            setEmail('');
            setGroupId('');
            if (result.duplicates.length > 0) {
              raiseMergePrompt(
                result.duplicates,
                result.created.map((id, index) => ({
                  id,
                  phone: index === 0 ? phone : undefined,
                  email: index === 0 ? email : undefined,
                })),
              );
            }
          });
        }}
      >
        {error && <Banner tone="danger">{error}</Banner>}
        <FieldShell id="guest-name" label={t('addDialog.name')}>
          {(describedBy) => (
            <Input
              id="guest-name"
              aria-describedby={describedBy}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          )}
        </FieldShell>
        <FieldShell id="guest-phone" label={t('addDialog.phone')}>
          {(describedBy) => (
            <Input
              id="guest-phone"
              aria-describedby={describedBy}
              value={phone}
              inputMode="tel"
              autoComplete="tel"
              onChange={(event) => setPhone(event.target.value)}
            />
          )}
        </FieldShell>
        <FieldShell id="guest-email" label={t('addDialog.email')}>
          {(describedBy) => (
            <Input
              id="guest-email"
              aria-describedby={describedBy}
              value={email}
              inputMode="email"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </FieldShell>
        {groups.length > 0 && (
          <Select
            label={t('addDialog.groups')}
            value={groupId}
            options={[{ value: '', label: '—' }, ...groups.map((group) => ({ value: group.id, label: group.name }))]}
            onValueChange={setGroupId}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy}>
            {t('addDialog.save')}
          </Button>
          <ContactsButton eventId={eventId} label={t('addDialog.fromContacts')} variant="secondary" />
        </div>
      </form>
    </ResponsiveDialog>
  );
}

export function PasteDialog({ eventId, triggerLabel }: { eventId: string; triggerLabel?: string }) {
  const t = useTranslations('events.guests');
  const { run, busy, error } = useRun();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const [preview, setPreview] = React.useState<ParsedGuestRow[] | undefined>();

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setText('');
          setPreview(undefined);
        }
      }}
      trigger={<Button variant="secondary">{triggerLabel ?? t('empty.paste')}</Button>}
      title={t('pasteDialog.title')}
      description={t('pasteDialog.hint')}
    >
      <div className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}
        <FieldShell id="paste-text" label={t('pasteDialog.title')}>
          {(describedBy) => (
            <Textarea
              id="paste-text"
              aria-describedby={describedBy}
              rows={6}
              placeholder={t('pasteDialog.placeholder')}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setPreview(undefined);
              }}
            />
          )}
        </FieldShell>
        {!preview ? (
          <div>
            <Button
              disabled={!text.trim() || busy}
              loading={busy}
              onClick={() => void run(() => previewPaste({ eventId, text })).then((rows) => rows && setPreview(rows))}
            >
              {t('pasteDialog.parse')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex max-h-64 flex-col gap-2 overflow-auto">
              {preview.map((row, index) => (
                <div key={index} className="border-border flex flex-col gap-1 rounded-md border p-2 text-sm">
                  <p className="font-medium">{row.name || row.phone || row.email || `—`}</p>
                  <p className="text-muted text-xs">
                    {[row.phone, row.email].filter(Boolean).join(' · ') || t('table.noContact')}
                  </p>
                  {row.phoneInvalid && <p className="text-warning text-xs">{t('pasteDialog.badPhone')}</p>}
                  {row.emailInvalid && <p className="text-warning text-xs">{t('pasteDialog.badEmail')}</p>}
                  {!row.name && <p className="text-warning text-xs">{t('pasteDialog.noName')}</p>}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                loading={busy}
                onClick={() =>
                  void run(() =>
                    addGuestsAction({
                      eventId,
                      source: 'PASTE',
                      guests: preview.map((row) => ({
                        name: row.name,
                        ...(row.phone ? { phone: row.phone } : {}),
                        ...(row.email ? { email: row.email } : {}),
                        groupIds: [],
                      })),
                    }),
                  ).then((result) => {
                    if (!result) return;
                    setOpen(false);
                    if (result.duplicates.length > 0) {
                      raiseMergePrompt(
                        result.duplicates,
                        result.created.map((id, index) => ({
                          id,
                          phone: preview[index]?.phone ?? undefined,
                          email: preview[index]?.email ?? undefined,
                        })),
                      );
                    }
                  })
                }
              >
                {t('pasteDialog.confirm', { count: preview.length })}
              </Button>
              <Button variant="ghost" onClick={() => setPreview(undefined)}>
                {t('pasteDialog.back')}
              </Button>
            </div>
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}

const CSV_FIELDS = ['name', 'phone', 'email', 'group', 'plusOnes', 'meal', 'dietary'] as const;

export function CsvDialog({
  eventId,
  total,
  triggerLabel,
  triggerIcon,
}: {
  eventId: string;
  total: number;
  triggerLabel?: string;
  triggerIcon?: React.ReactNode;
}) {
  const t = useTranslations('events.guests');
  const { run, busy, error, setError } = useRun();
  const [open, setOpen] = React.useState(false);
  const [header, setHeader] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [file, setFile] = React.useState<File | undefined>();
  const [importing, setImporting] = React.useState<{ totalRows: number; startTotal: number } | undefined>();

  function close() {
    setOpen(false);
    setHeader([]);
    setRows([]);
    setMapping({});
    setFile(undefined);
    setImporting(undefined);
  }

  function onFile(picked: File | undefined) {
    setFile(picked);
    setImporting(undefined);
    if (!picked) return;
    if (!picked.name.toLowerCase().endsWith('.csv') && picked.type !== 'text/csv') {
      setError(t('csvDialog.badFile'));
      return;
    }
    Papa.parse<string[]>(picked, {
      preview: 6,
      skipEmptyLines: true,
      complete: (parsed) => {
        const [head, ...body] = parsed.data;
        if (!head) {
          setError(t('csvDialog.badFile'));
          return;
        }
        setHeader(head);
        setRows(body.slice(0, 5));
        void run(() => suggestMapping({ eventId, header: head })).then((suggestion) => {
          if (!suggestion) return;
          const next: Record<string, string> = {};
          for (const [field, index] of Object.entries(suggestion)) next[field] = String(index);
          setMapping(next);
        });
      },
    });
  }

  async function startImport() {
    if (!file || mapping['name'] === undefined) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(t('csvDialog.badFile'));
      return;
    }
    // Full parse for the row count (cap 5,000) before uploading.
    const parsed: string[][] = await new Promise((resolve, reject) => {
      Papa.parse<string[]>(file, { skipEmptyLines: true, complete: (result) => resolve(result.data), error: reject });
    });
    const body = parsed.slice(1);
    if (body.length === 0 || body.length > 5000) {
      setError(t('csvDialog.tooMany'));
      return;
    }
    const signed = await run(() => csvUploadUrl({ eventId, sizeBytes: file.size }));
    if (!signed) return;
    const put = await fetch(signed.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'text/csv' },
    }).catch(() => null);
    if (!put?.ok) {
      setError(t('errors.generic'));
      return;
    }
    const confirmed: Record<string, number> = {};
    for (const [field, value] of Object.entries(mapping)) {
      if (value !== '') confirmed[field] = Number(value);
    }
    const queued = await run(() =>
      importCsv({ eventId, fileKey: signed.key, mapping: confirmed as { name: number }, totalRows: body.length }),
    );
    if (queued) setImporting({ totalRows: body.length, startTotal: total });
  }

  const done = importing ? Math.min(Math.max(total - importing.startTotal, 0), importing.totalRows) : 0;
  const finished = importing && done >= importing.totalRows;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      trigger={
        <Button variant="secondary">
          {triggerIcon ?? <Upload aria-hidden className="size-4" />}
          {triggerLabel ?? t('empty.csv')}
        </Button>
      }
      title={t('csvDialog.title')}
    >
      <div className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}
        {!importing ? (
          <>
            <FieldShell id="csv-file" label={t('csvDialog.pick')}>
              {(describedBy) => (
                <Input
                  id="csv-file"
                  aria-describedby={describedBy}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => onFile(event.target.files?.[0])}
                />
              )}
            </FieldShell>
            {header.length > 0 && (
              <>
                <div className="flex flex-col gap-2">
                  <p className="font-medium">{t('csvDialog.headers')}</p>
                  {CSV_FIELDS.map((field) => (
                    <Select
                      key={field}
                      label={t(`csvDialog.fields.${field}`)}
                      value={mapping[field] ?? ''}
                      options={[
                        { value: '', label: t('csvDialog.ignore') },
                        ...header.map((column, index) => ({ value: String(index), label: column })),
                      ]}
                      onValueChange={(value) => setMapping((current) => ({ ...current, [field]: value }))}
                    />
                  ))}
                </div>
                {rows.length > 0 && <div className="text-muted text-xs">{rows[0]?.join(' · ')}</div>}
                <div>
                  <Button
                    disabled={mapping['name'] === undefined || mapping['name'] === '' || busy}
                    loading={busy}
                    onClick={() => void startImport()}
                  >
                    {t('empty.csv')}
                  </Button>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <ProgressBar
              value={done}
              max={importing.totalRows}
              label={t('csvDialog.importing', { done, total: importing.totalRows })}
              showValue
            />
            {finished && <Banner tone="info">{t('csvDialog.done', { count: importing.totalRows })}</Banner>}
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}

export function EditGuestDialog({
  eventId,
  guest,
  appUrl,
}: {
  eventId: string;
  guest: GuestRow & { inviteToken?: string | undefined };
  appUrl: string;
}) {
  const t = useTranslations('events.guests');
  const tp = useTranslations('events.invites.policies');
  const { run, busy, error } = useRun();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(guest.name);
  const [phone, setPhone] = React.useState(guest.phone ?? '');
  const [email, setEmail] = React.useState(guest.email ?? '');
  const [link, setLink] = React.useState<string | undefined>(
    guest.inviteToken ? `${appUrl}/i/${guest.inviteToken}` : undefined,
  );
  const [copied, setCopied] = React.useState(false);
  const [revoking, setRevoking] = React.useState(false);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="sm">
          {t('table.edit')}
        </Button>
      }
      title={t('editDialog.title')}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => editGuest({ eventId, guestId: guest.id, name, phone, email })).then((ok) => {
            if (ok !== undefined) setOpen(false);
          });
        }}
      >
        {error && <Banner tone="danger">{error}</Banner>}
        <FieldShell id={`edit-name-${guest.id}`} label={t('addDialog.name')}>
          {(describedBy) => (
            <Input
              id={`edit-name-${guest.id}`}
              aria-describedby={describedBy}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          )}
        </FieldShell>
        <FieldShell id={`edit-phone-${guest.id}`} label={t('addDialog.phone')}>
          {(describedBy) => (
            <Input
              id={`edit-phone-${guest.id}`}
              aria-describedby={describedBy}
              value={phone}
              inputMode="tel"
              onChange={(event) => setPhone(event.target.value)}
            />
          )}
        </FieldShell>
        <FieldShell id={`edit-email-${guest.id}`} label={t('addDialog.email')}>
          {(describedBy) => (
            <Input
              id={`edit-email-${guest.id}`}
              aria-describedby={describedBy}
              value={email}
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </FieldShell>
        <div>
          <Button type="submit" loading={busy}>
            {t('editDialog.save')}
          </Button>
        </div>
      </form>
      {link && (
        <div className="border-border flex flex-col gap-2 border-t pt-3">
          <p className="text-sm font-medium">{tp('linkLabel')}</p>
          <div className="flex gap-2">
            <Input
              value={link}
              readOnly
              aria-label={tp('linkLabel')}
              className="min-w-0 flex-1"
              onChange={() => undefined}
            />
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => setCopied(true));
              }}
            >
              {copied ? tp('copied') : tp('copy')}
            </Button>
          </div>
          <div>
            <Button
              variant="ghost"
              loading={revoking}
              onClick={() =>
                void (async () => {
                  setRevoking(true);
                  const result = await revokeInviteAction({ eventId, guestId: guest.id });
                  setRevoking(false);
                  if (result.ok) {
                    setLink(`${appUrl}/i/${result.data.token}`);
                    setCopied(false);
                    router.refresh();
                  }
                })()
              }
            >
              {tp('revoke')}
            </Button>
          </div>
        </div>
      )}
    </ResponsiveDialog>
  );
}

export interface AddedGuestContact {
  id: string;
  phone?: string | undefined;
  email?: string | undefined;
}

export function MergeDialog({
  eventId,
  duplicates,
  added,
  onClose,
  errorText: toText,
}: {
  eventId: string;
  duplicates: { id: string; name: string; phone: string | null; email: string | null }[];
  added: AddedGuestContact[];
  onClose: () => void;
  errorText: (result: Extract<ActionResult<unknown>, { ok: false }>) => string;
}) {
  const t = useTranslations('events.guests');
  const router = useRouter();
  const [error, setError] = React.useState<string | undefined>();
  const [merged, setMerged] = React.useState<string[]>([]);

  // Pair each existing duplicate with the added guest sharing its contact.
  // Phones compare digit-insensitively: the form holds national format
  // (0803…) while stored numbers are E.164 (+234803…) — strict equality
  // silently matched nothing and the dialog never opened (P4-T12).
  const digits = (value: string): string => {
    const only = value.replace(/\D/g, '');
    return only.length > 10 ? only.slice(-10) : only;
  };
  const pairs = duplicates.flatMap((dup) => {
    const match = added.find(
      (row) =>
        (row.phone && dup.phone && digits(row.phone) === digits(dup.phone)) ||
        (row.email && dup.email && row.email.toLowerCase() === dup.email.toLowerCase()),
    );
    return match ? [{ dup, match }] : [];
  });

  if (pairs.length === 0) return null;
  const remaining = pairs.filter(({ dup }) => !merged.includes(dup.id));
  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => !next && onClose()}
      trigger={<span />}
      title={t('mergeDialog.title')}
      description={t('mergeDialog.body')}
    >
      <div className="flex flex-col gap-3">
        {error && <Banner tone="danger">{error}</Banner>}
        {remaining.length === 0 && (
          <p role="status" className="text-sm font-medium">
            {t('mergeDialog.merged')}
          </p>
        )}
        {remaining.map(({ dup, match }) => (
          <div key={dup.id} className="border-border flex items-center gap-2 rounded-md border p-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{dup.name}</p>
            <Button
              variant="secondary"
              onClick={() =>
                void mergeGuestsAction({ eventId, keepId: dup.id, dropIds: [match.id] }).then((result) => {
                  if (!result.ok) setError(toText(result));
                  else {
                    setMerged((current) => [...current, dup.id]);
                    router.refresh();
                  }
                })
              }
            >
              {t('mergeDialog.mergeInto', { name: dup.name })}
            </Button>
          </div>
        ))}
        <div>
          <Button variant="ghost" onClick={onClose}>
            {t('mergeDialog.skip')}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

interface ContactPickerContact {
  name?: string[];
  tel?: string[];
  email?: string[];
}

function contactsSupported(): boolean {
  return typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;
}

export function ContactsButton({
  eventId,
  label,
  variant = 'secondary',
}: {
  eventId: string;
  label: string;
  variant?: 'secondary' | 'ghost';
}) {
  const t = useTranslations('events.guests');
  const { run, busy, error } = useRun();
  // Feature-detected on first render (client-only component): unsupported browsers get nothing.
  const [supported] = React.useState(contactsSupported);
  const [picked, setPicked] = React.useState<number | undefined>();
  if (!supported) return null;

  async function pick() {
    const api = (
      navigator as Navigator & {
        contacts: { select: (props: string[], opts: { multiple: boolean }) => Promise<ContactPickerContact[]> };
      }
    ).contacts;
    let contacts: ContactPickerContact[];
    try {
      contacts = await api.select(['name', 'tel', 'email'], { multiple: true });
    } catch {
      return; // user dismissed the picker
    }
    const guests = contacts
      .map((contact) => ({
        name: contact.name?.[0] ?? '',
        ...(contact.tel?.[0] ? { phone: contact.tel[0] } : {}),
        ...(contact.email?.[0] ? { email: contact.email[0] } : {}),
        groupIds: [] as string[],
      }))
      .filter((guest) => guest.name || guest.phone || guest.email)
      .slice(0, 500);
    if (guests.length === 0) return;
    const result = await run(() => addGuestsAction({ eventId, source: 'CONTACTS', guests }));
    if (result) {
      setPicked(guests.length);
      if (result.duplicates.length > 0) {
        raiseMergePrompt(
          result.duplicates,
          result.created.map((id, index) => ({ id, phone: guests[index]?.phone, email: guests[index]?.email })),
        );
      }
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Button variant={variant} loading={busy} onClick={() => void pick()}>
        {picked ? t('contactsPicked', { count: picked }) : label}
      </Button>
      {error && <Banner tone="danger">{error}</Banner>}
    </span>
  );
}
