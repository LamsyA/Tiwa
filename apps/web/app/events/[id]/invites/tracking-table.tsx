'use client';

import type { DeliveryRow, InviteBatchRow } from '@tiwa/core';
import { Avatar, Card, DataTable, EmptyState, Select, StatusPill } from '@tiwa/ui';
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useLive } from '@/hooks/use-live.js';

export function TrackingSection({
  eventId,
  batches,
  selectedId,
  deliveries,
}: {
  eventId: string;
  batches: InviteBatchRow[];
  selectedId: string | null;
  deliveries: DeliveryRow[];
}) {
  const t = useTranslations('events.invites.tracking');
  const tg = useTranslations('events.guests');
  const router = useRouter();
  useLive(`/api/sse/invites/${eventId}`, () => router.refresh());

  if (batches.length === 0) {
    return <EmptyState title={t('title')} body={t('empty')} icon={<Send aria-hidden />} />;
  }
  const selected = batches.find((batch) => batch.id === selectedId) ?? batches[0];
  const pending = selected ? selected.total - selected.sent - selected.failed : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-medium">{t('title')}</h3>
        <span className="ml-auto min-w-52">
          <Select
            aria-label={t('batch')}
            value={selected?.id ?? ''}
            options={batches.map((batch) => ({
              value: batch.id,
              label: `${t(`kinds.${batch.kind}`)} · ${t(`batchStatuses.${batch.status}`)} · ${new Date(batch.createdAt).toLocaleDateString()}`,
            }))}
            onValueChange={(value) => router.replace(`/events/${eventId}/invites?batch=${value}`)}
          />
        </span>
      </div>
      {selected && (
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3 text-center">
            <p className="font-display text-xl font-bold">{selected.sent}</p>
            <p className="text-muted text-xs">{t('sent')}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="font-display text-xl font-bold">{selected.failed}</p>
            <p className="text-muted text-xs">{t('failed')}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="font-display text-xl font-bold">{pending}</p>
            <p className="text-muted text-xs">{t('pending')}</p>
          </Card>
        </div>
      )}
      <DataTable<DeliveryRow>
        ariaLabel={t('title')}
        rows={deliveries}
        rowKey={(row) => row.id}
        columns={[
          {
            key: 'guest',
            header: t('guest'),
            cell: (row) => (
              <span className="flex items-center gap-2">
                <Avatar name={row.guestName} size="sm" />
                <span>
                  <span className="block font-medium">{row.guestName}</span>
                  {row.contact && <span className="text-muted block text-xs">{row.contact}</span>}
                </span>
              </span>
            ),
            sortable: true,
            sortValue: (row) => row.guestName,
          },
          {
            key: 'channel',
            header: t('channel'),
            cell: (row) => <span className="text-sm">{t(`channels.${row.channel}`)}</span>,
          },
          {
            key: 'status',
            header: t('status'),
            cell: (row) => (
              <StatusPill tone={row.status === 'FAILED' ? 'danger' : row.status === 'QUEUED' ? 'neutral' : 'success'}>
                {t(`statuses.${row.status}`)}
              </StatusPill>
            ),
          },
          {
            key: 'rsvp',
            header: t('rsvp'),
            cell: (row) => (
              <StatusPill tone={row.rsvp === 'YES' ? 'success' : row.rsvp === 'NO' ? 'danger' : 'neutral'}>
                {tg(`rsvpLabels.${row.rsvp}` as 'rsvpLabels.YES')}
              </StatusPill>
            ),
          },
        ]}
        renderCard={(row) => (
          <Card className="flex items-center gap-3 p-3">
            <Avatar name={row.guestName} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{row.guestName}</span>
              <span className="text-muted block text-xs">{t(`channels.${row.channel}`)}</span>
            </span>
            <StatusPill tone={row.status === 'FAILED' ? 'danger' : row.status === 'QUEUED' ? 'neutral' : 'success'}>
              {t(`statuses.${row.status}`)}
            </StatusPill>
          </Card>
        )}
      />
    </div>
  );
}
