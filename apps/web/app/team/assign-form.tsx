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
  members: { userId: string; role: string }[];
  events: { id: string; name: string }[];
}) {
  const t = useTranslations('planner');
  const [pending, setPending] = useState(false);
  return (
    <form
      className="bg-surface flex flex-col gap-2 rounded-lg p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setPending(true);
        try {
          await assignStaffAction({
            orgId,
            eventId: String(data.get('eventId')),
            userId: String(data.get('userId')),
          });
        } finally {
          setPending(false);
        }
      }}
    >
      <h3 className="font-semibold">{t('assignHeading')}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          {t('eventLabel')}
          <select name="eventId" required className="border-border rounded-md border px-3 py-2">
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('memberLabel')}
          <select name="userId" required className="border-border rounded-md border px-3 py-2">
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.userId} · {m.role}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="submit"
        disabled={pending || events.length === 0}
        className="bg-brand-strong text-on-brand rounded-md px-4 py-2 text-sm font-medium"
      >
        {t('assignAction')}
      </button>
    </form>
  );
}
