'use client';

import { Banner, Button, Card, ConfirmDialog, EmptyState, FieldShell, Input, ResponsiveDialog } from '@tiwa/ui';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { ActionResult } from '@/lib/action.js';
import { createGroupAction, editGroup, removeGroup } from './actions.js';
import { errorText, type GuestGroupItem } from './guests-manager.js';

export function GroupsManager({
  eventId,
  groups,
  canManage,
}: {
  eventId: string;
  groups: GuestGroupItem[];
  canManage: boolean;
}) {
  const t = useTranslations('events.guests');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h3 className="font-medium">{t('groups.title')}</h3>
        {canManage && (
          <span className="ml-auto">
            <GroupDialog eventId={eventId} />
          </span>
        )}
      </div>
      {groups.length === 0 ? (
        <EmptyState title={t('groups.title')} body={t('groups.empty')} icon={<Users aria-hidden />} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Card key={group.id} className="flex items-center gap-3 p-3">
              <span
                aria-hidden
                className="size-8 shrink-0 rounded-full"
                style={{ backgroundColor: group.color ?? 'var(--brand)' }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{group.name}</span>
                <span className="text-muted text-sm">{t('groups.members', { count: group.memberCount })}</span>
              </span>
              {canManage && (
                <span className="flex gap-1">
                  <GroupDialog eventId={eventId} group={group} />
                  <DeleteGroupButton eventId={eventId} group={group} />
                </span>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const GROUP_COLORS = ['#b83a17', '#15803d', '#2563eb', '#7c3aed', '#b45309', '#0f766e', '#be185d'];

function GroupDialog({ eventId, group }: { eventId: string; group?: GuestGroupItem }) {
  const t = useTranslations('events.guests');
  const te = useTranslations('events.guests.errors');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(group?.name ?? '');
  const [color, setColor] = React.useState(group?.color ?? GROUP_COLORS[0] ?? '#b83a17');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function save() {
    setBusy(true);
    setError(undefined);
    const result: ActionResult<unknown> = group
      ? await editGroup({ eventId, groupId: group.id, name, color })
      : await createGroupAction({ eventId, name, color });
    setBusy(false);
    if (!result.ok) {
      setError(errorText(te, result));
      return;
    }
    setOpen(false);
    if (!group) {
      setName('');
      setColor(GROUP_COLORS[0] ?? '#b83a17');
    }
    router.refresh();
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        group ? (
          <Button variant="ghost" size="sm">
            {t('editDialog.save')}
          </Button>
        ) : (
          <Button variant="secondary">{t('groups.add')}</Button>
        )
      }
      title={group ? group.name : t('groups.add')}
    >
      <div className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}
        <FieldShell id={`group-name-${group?.id ?? 'new'}`} label={t('groups.name')}>
          {(describedBy) => (
            <Input
              id={`group-name-${group?.id ?? 'new'}`}
              aria-describedby={describedBy}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FieldShell>
        <div className="flex flex-wrap gap-2">
          {GROUP_COLORS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={preset}
              onClick={() => setColor(preset)}
              className={color === preset ? 'size-9 rounded-full ring-2 ring-offset-2' : 'size-9 rounded-full'}
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>
        <div>
          <Button disabled={!name.trim() || busy} loading={busy} onClick={() => void save()}>
            {t('groups.save')}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function DeleteGroupButton({ eventId, group }: { eventId: string; group: GuestGroupItem }) {
  const t = useTranslations('events.guests');
  const te = useTranslations('events.guests.errors');
  const router = useRouter();
  const [error, setError] = React.useState<string | undefined>();
  return (
    <span className="inline-flex flex-col gap-1">
      <ConfirmDialog
        destructive
        trigger={
          <Button variant="ghost" size="sm">
            {t('groups.delete')}
          </Button>
        }
        title={t('groups.delete')}
        body={t('groups.deleteConfirm')}
        confirmLabel={t('groups.delete')}
        onConfirm={() =>
          void removeGroup({ eventId, groupId: group.id }).then((result) => {
            if (!result.ok) setError(errorText(te, result));
            else router.refresh();
          })
        }
      />
      {error && <Banner tone="danger">{error}</Banner>}
    </span>
  );
}
