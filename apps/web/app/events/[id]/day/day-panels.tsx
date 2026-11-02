'use client';

import { Button, Card, Input } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { createContactAction, deleteContactAction, logIncidentAction, resolveIncidentAction } from './actions.js';
import type { DayMutation } from './day-queue.js';

export interface DayIncident {
  id: string;
  title: string;
  details: string | null;
  severity: string;
  ownerUserId: string | null;
  ownerName: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  createdAt: string;
}

export interface DayContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  isBackupVendor: boolean;
}

/** Incidents tab (P12-T05, DAY-04): log what went wrong, resolve with a note. */
export function IncidentsPanel(props: {
  eventId: string;
  canManage: boolean;
  incidents: DayIncident[];
  owners: { id: string; name: string; kind: 'user' | 'org' }[];
  submit: (mutation: DayMutation | null, fn: () => Promise<{ ok: boolean }>) => void;
  pending: boolean;
}) {
  const t = useTranslations('day');
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [severity, setSeverity] = useState('normal');
  const [owner, setOwner] = useState('');
  const [resolutions, setResolutions] = useState<Record<string, string>>({});

  const run = (mutation: DayMutation, fn: () => Promise<{ ok: boolean }>) => {
    setError(null);
    props.submit(mutation, async () => {
      const result = await fn();
      if (!result.ok) setError('saveFailed');
      return result;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-danger text-sm">{error}</p>}
      {props.canManage && (
        <Card className="flex flex-col gap-2 p-4">
          <Input
            aria-label={t('incidentTitle')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('incidentTitle')}
          />
          <Input
            aria-label={t('incidentDetails')}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder={t('incidentDetails')}
          />
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={t('severity')}
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className="border-border bg-bg rounded-xl border px-3 py-2 text-sm"
            >
              <option value="low">{t('severityLow')}</option>
              <option value="normal">{t('severityNormal')}</option>
              <option value="high">{t('severityHigh')}</option>
            </select>
            <select
              aria-label={t('owner')}
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
              className="border-border bg-bg rounded-xl border px-3 py-2 text-sm"
            >
              <option value="">{t('unassigned')}</option>
              {props.owners
                .filter((entry) => entry.kind === 'user')
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
            </select>
            <Button
              disabled={props.pending || !title.trim()}
              onClick={() => {
                const payload = {
                  title: title.trim(),
                  details: details.trim() || undefined,
                  severity: severity as 'low' | 'normal' | 'high',
                  ownerUserId: owner || null,
                };
                run({ kind: 'incident-log', ...payload }, () =>
                  logIncidentAction({ eventId: props.eventId, ...payload }),
                );
              }}
            >
              {t('logIncident')}
            </Button>
          </div>
        </Card>
      )}
      {props.incidents.length === 0 && <p className="text-muted text-sm">{t('noIncidents')}</p>}
      <ul className="flex flex-col gap-2">
        {props.incidents.map((row) => (
          <li key={row.id} className="border-border bg-bg rounded-xl border p-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">{row.title}</span>
              <span className="rounded-full border px-2 py-0.5 text-xs">
                {row.severity === 'high'
                  ? t('severityHigh')
                  : row.severity === 'low'
                    ? t('severityLow')
                    : t('severityNormal')}
              </span>
              {row.ownerName && <span className="text-muted">{row.ownerName}</span>}
              {row.resolvedAt && (
                <span className="ml-auto rounded-full border px-2 py-0.5 text-xs">{t('resolved')}</span>
              )}
            </div>
            {row.details && <p className="text-muted mt-1">{row.details}</p>}
            {row.resolvedAt
              ? row.resolution && <p className="mt-1">{row.resolution}</p>
              : props.canManage && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Input
                      aria-label={t('resolution')}
                      value={resolutions[row.id] ?? ''}
                      onChange={(event) => setResolutions((prev) => ({ ...prev, [row.id]: event.target.value }))}
                      placeholder={t('resolution')}
                      className="min-w-40 flex-1"
                    />
                    <Button
                      variant="secondary"
                      disabled={props.pending}
                      onClick={() => {
                        const resolution = resolutions[row.id]?.trim() || undefined;
                        run({ kind: 'incident-resolve', incidentId: row.id, resolution }, () =>
                          resolveIncidentAction({ eventId: props.eventId, incidentId: row.id, resolution }),
                        );
                      }}
                    >
                      {t('resolve')}
                    </Button>
                  </div>
                )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Contacts tab (P12-T05, DAY-05): emergency contacts, backup vendors,
 * and the on-site vendors derived from bookings. */
export function ContactsPanel(props: {
  eventId: string;
  canManage: boolean;
  contacts: DayContact[];
  onsiteVendors: { orgId: string; name: string }[];
  submit: (mutation: DayMutation | null, fn: () => Promise<{ ok: boolean }>) => void;
  pending: boolean;
}) {
  const t = useTranslations('day');
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [backup, setBackup] = useState(false);

  const run = (mutation: DayMutation, fn: () => Promise<{ ok: boolean }>) => {
    setError(null);
    props.submit(mutation, async () => {
      const result = await fn();
      if (!result.ok) setError('saveFailed');
      return result;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-danger text-sm">{error}</p>}
      {props.canManage && (
        <Card className="flex flex-col gap-2 p-4">
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label={t('contactName')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('contactName')}
              className="min-w-32 flex-1"
            />
            <Input
              aria-label={t('contactRole')}
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder={t('contactRole')}
              className="min-w-32 flex-1"
            />
            <Input
              aria-label={t('contactPhone')}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={t('contactPhone')}
              inputMode="tel"
              className="w-40"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={backup} onChange={(event) => setBackup(event.target.checked)} />
              {t('backupVendor')}
            </label>
            <Button
              disabled={props.pending || !name.trim() || !role.trim() || !phone.trim()}
              onClick={() => {
                const payload = { name: name.trim(), role: role.trim(), phone: phone.trim(), isBackupVendor: backup };
                run({ kind: 'contact-create', ...payload }, () =>
                  createContactAction({ eventId: props.eventId, ...payload }),
                );
              }}
            >
              {t('addContact')}
            </Button>
          </div>
        </Card>
      )}
      {props.contacts.length === 0 && props.onsiteVendors.length === 0 && (
        <p className="text-muted text-sm">{t('noContacts')}</p>
      )}
      <ul className="flex flex-col gap-2">
        {props.contacts.map((row) => (
          <li key={row.id} className="border-border bg-bg rounded-xl border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{row.name}</span>
              <span className="text-muted">{row.role}</span>
              {row.isBackupVendor && (
                <span className="rounded-full border px-2 py-0.5 text-xs">{t('backupVendor')}</span>
              )}
              <span className="ml-auto flex gap-2">
                <a className="underline" href={`tel:${encodeURIComponent(row.phone)}`}>
                  {t('call')}
                </a>
                <a
                  className="underline"
                  href={`https://wa.me/${row.phone.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('whatsapp')}
                </a>
                {props.canManage && (
                  <Button
                    variant="ghost"
                    disabled={props.pending}
                    onClick={() =>
                      run({ kind: 'contact-delete', contactId: row.id }, () =>
                        deleteContactAction({ eventId: props.eventId, contactId: row.id }),
                      )
                    }
                  >
                    {t('delete')}
                  </Button>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {props.onsiteVendors.length > 0 && (
        <Card className="flex flex-col gap-1 p-3 text-sm">
          <h3 className="font-medium">{t('onsiteVendors')}</h3>
          {props.onsiteVendors.map((row) => (
            <p key={row.orgId} className="text-muted">
              {row.name}
            </p>
          ))}
        </Card>
      )}
    </div>
  );
}
