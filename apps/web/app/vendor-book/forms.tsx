'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { addBookEntryToEventAction, addVendorBookAction, removeVendorBookAction } from './actions.js';

export function VendorBookForms({ orgId, events }: { orgId: string; events: { id: string; name: string }[] }) {
  const t = useTranslations('planner');
  const [pending, setPending] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <form
        className="bg-surface flex flex-col gap-2 rounded-lg p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setPending(true);
          try {
            await addVendorBookAction({
              orgId,
              name: String(data.get('name') ?? ''),
              category: String(data.get('category') ?? ''),
              phone: String(data.get('phone') ?? '') || undefined,
              notes: String(data.get('notes') ?? '') || undefined,
              rateNote: String(data.get('rate') ?? '') || undefined,
            });
            e.currentTarget.reset();
          } finally {
            setPending(false);
          }
        }}
      >
        <h3 className="font-display text-base font-bold tracking-tight">{t('addVendorHeading')}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            {t('nameLabel')}
            <input name="name" required maxLength={120} className="border-border rounded-xl border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('categoryLabel')}
            <input name="category" required maxLength={60} className="border-border rounded-xl border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('phoneLabel')}
            <input name="phone" maxLength={30} className="border-border rounded-xl border px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('rateLabel')}
            <input name="rate" maxLength={500} className="border-border rounded-xl border px-3 py-2" />
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-strong text-on-brand rounded-xl px-4 py-2 text-sm font-medium"
        >
          {t('create')}
        </button>
      </form>
      <AddToEventForm events={events} />
      <RemoveForm />
    </div>
  );
}

function AddToEventForm({ events }: { events: { id: string; name: string }[] }) {
  const t = useTranslations('planner');
  return (
    <form
      className="bg-surface flex flex-wrap items-end gap-2 rounded-lg p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        await addBookEntryToEventAction({
          entryId: String(data.get('entryId')),
          eventId: String(data.get('eventId')),
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        {t('entryLabel')}
        <input name="entryId" required className="border-border rounded-xl border px-3 py-2" />
      </label>
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
      <button type="submit" className="border-border rounded-xl border px-4 py-2 text-sm font-medium">
        {t('addToEvent')}
      </button>
    </form>
  );
}

function RemoveForm() {
  const t = useTranslations('planner');
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        await removeVendorBookAction({ entryId: String(data.get('entryId')) });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        {t('entryLabel')}
        <input name="entryId" required className="border-border rounded-xl border px-3 py-2" />
      </label>
      <button type="submit" className="border-border rounded-xl border px-4 py-2 text-sm font-medium">
        {t('removeAction')}
      </button>
    </form>
  );
}
