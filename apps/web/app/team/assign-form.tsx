'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { assignStaffAction } from './actions.js';

export function AssignForm({
  orgId,
  members,
  events,
}: {
  orgId: string;
  members: { userId: string; role: string; name?: string | null; contact?: string | null }[];
  events: { id: string; name: string }[];
}) {
  const t = useTranslations('planner');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'done' | 'already' | 'error' | null>(null);
  return (
    <form
      className="bg-surface flex flex-col gap-2 rounded-lg p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setPending(true);
        setStatus(null);
        try {
          const result = await assignStaffAction({
            orgId,
            eventId: String(data.get('eventId')),
            userId: String(data.get('userId')),
          });
          // D-X88: say what happened instead of failing silently.
          if (result.ok) setStatus('done');
          else setStatus(result.code === 'CONFLICT' ? 'already' : 'error');
        } catch {
          setStatus('error');
        } finally {
          setPending(false);
        }
      }}
    >
      <h3 className="font-display text-base font-bold tracking-tight">{t('assignHeading')}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          {t('eventLabel')}
          <select name="eventId" required className="border-border rounded-xl border px-3 py-2">
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('memberLabel')}
          <select name="userId" required className="border-border rounded-xl border px-3 py-2">
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name || m.contact || m.userId} · {m.role}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="submit"
        disabled={pending || events.length === 0}
        className="bg-brand-strong text-on-brand rounded-xl px-4 py-2 text-sm font-medium"
      >
        {t('assignAction')}
      </button>
      {status && (
        <p role="status" className={`text-sm ${status === 'done' ? 'text-success' : 'text-danger'}`}>
          {t(`assignStatus.${status}`)}
        </p>
      )}
    </form>
  );
}
