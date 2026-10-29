'use client';

import type { ParticipantRow } from '@tiwa/core';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  FieldShell,
  Input,
  MoneyInput,
  MoneyText,
  SegmentedControl,
  Select,
  StatusPill,
} from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { ActionResult } from '@/lib/action.js';
import { addEventMember, removeEventMember, updateEventMember } from './actions.js';

const ROLES = ['CO_HOST', 'PLANNER', 'PLANNER_STAFF'] as const;
const PRESETS = ['view_only', 'contributor', 'finance', 'full'] as const;
type Preset = (typeof PRESETS)[number];
const CAN_APPROVE: Preset[] = ['finance', 'full'];

interface Props {
  eventId: string;
  me: string;
  currency: string;
  canManage: boolean;
  members: ParticipantRow[];
}

function useErrorText() {
  const t = useTranslations('events.members.errors');
  return (result: Extract<ActionResult<unknown>, { ok: false }>): string => {
    const key = result.fieldErrors ? Object.values(result.fieldErrors).flat()[0] : result.code;
    return key && t.has(key) ? t(key) : t('generic');
  };
}

export function MembersManager({ eventId, me, currency, canManage, members }: Props) {
  const t = useTranslations('events');
  const [status, setStatus] = React.useState<{ tone: 'info' | 'warning' | 'danger'; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {status && <Banner tone={status.tone}>{status.text}</Banner>}
      {canManage && <AddMember eventId={eventId} currency={currency} onDone={setStatus} />}
      <section aria-labelledby="members-heading">
        <h3 id="members-heading" className="mb-2 font-medium">
          {t('members.membersHeading')}
        </h3>
        <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
          {members.map((member) => (
            <MemberRow
              key={member.id}
              eventId={eventId}
              member={member}
              self={member.userId === me}
              currency={currency}
              canManage={canManage && member.role !== 'HOST'}
              onError={(text) => setStatus({ tone: 'danger', text })}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function MemberRow({
  eventId,
  member,
  self,
  currency,
  canManage,
  onError,
}: {
  eventId: string;
  member: ParticipantRow;
  self: boolean;
  currency: string;
  canManage: boolean;
  onError: (text: string) => void;
}) {
  const t = useTranslations('events');
  const router = useRouter();
  const errorText = useErrorText();
  const [preset, setPreset] = React.useState<string>(member.preset);
  const name = member.name ?? member.contact ?? t('members.unnamed');

  async function run(work: () => Promise<ActionResult<unknown>>) {
    const result = await work();
    if (result.ok) router.refresh();
    else onError(errorText(result));
  }

  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {name} {self && <span className="text-muted text-sm">({t('members.you')})</span>}
        </p>
        <p className="text-muted text-sm">
          {t(`members.presets.${member.preset}` as 'members.presets.full')}
          {member.approveUpToMinor !== null && member.approveUpToMinor !== '0' && (
            <>
              {' · '}
              {t('members.upTo')} <MoneyText value={member.approveUpToMinor} currency={currency} />
            </>
          )}
        </p>
      </div>
      {!member.joined && <StatusPill tone="warning">{t('members.pending')}</StatusPill>}
      <Badge tone={member.role === 'HOST' ? 'brand' : 'neutral'}>{t(`roles.${member.role}`)}</Badge>
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={t('members.presetLabel')}
            value={preset}
            options={PRESETS.map((value) => ({ value, label: t(`members.presets.${value}`) }))}
            onValueChange={(value) => {
              setPreset(value);
              void run(() =>
                updateEventMember({
                  eventId,
                  participantId: member.id,
                  preset: value as Preset,
                  approveUpToMinor: member.approveUpToMinor,
                }),
              );
            }}
          />
          <ConfirmDialog
            destructive
            trigger={
              <Button size="sm" variant="ghost">
                {t('members.remove')}
              </Button>
            }
            title={t('members.removeTitle', { name })}
            body={t('members.removeBody')}
            confirmLabel={t('members.remove')}
            onConfirm={() => void run(() => removeEventMember({ eventId, participantId: member.id }))}
          />
        </div>
      )}
    </li>
  );
}

function AddMember({
  eventId,
  currency,
  onDone,
}: {
  eventId: string;
  currency: string;
  onDone: (status: { tone: 'info' | 'warning'; text: string }) => void;
}) {
  const t = useTranslations('events');
  const router = useRouter();
  const errorText = useErrorText();
  const [by, setBy] = React.useState<'phone' | 'email'>('phone');
  const [contact, setContact] = React.useState('');
  const [role, setRole] = React.useState<(typeof ROLES)[number]>('CO_HOST');
  const [preset, setPreset] = React.useState<Preset>('contributor');
  const [cap, setCap] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function submit() {
    setError(undefined);
    setSaving(true);
    try {
      const result = await addEventMember({
        eventId,
        [by]: contact,
        role,
        preset,
        ...(CAN_APPROVE.includes(preset) ? { approveUpToMinor: cap === '' ? null : cap } : {}),
      });
      if (result.ok) {
        setContact('');
        onDone({
          tone: result.data.sent ? 'info' : 'warning',
          text: result.data.sent ? t('members.added') : t('members.addedNotSent'),
        });
        router.refresh();
      } else setError(errorText(result));
    } catch {
      setError(t('members.errors.generic'));
    } finally {
      setSaving(false);
    }
  }

  const fieldId = `member-${by}`;
  return (
    <Card className="p-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h3 className="font-medium">{t('members.addHeading')}</h3>
        <SegmentedControl
          ariaLabel={t('members.inviteBy')}
          value={by}
          onValueChange={(value) => {
            if (value === 'phone' || value === 'email') {
              setBy(value);
              setContact('');
              setError(undefined);
            }
          }}
          options={[
            { value: 'phone', label: t('members.byPhone') },
            { value: 'email', label: t('members.byEmail') },
          ]}
        />
        <FieldShell
          id={fieldId}
          label={by === 'phone' ? t('members.phoneLabel') : t('members.emailLabel')}
          error={error}
        >
          {(describedBy) => (
            <Input
              id={fieldId}
              aria-describedby={describedBy}
              aria-invalid={Boolean(error)}
              type={by === 'phone' ? 'tel' : 'email'}
              autoComplete="off"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
            />
          )}
        </FieldShell>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t('members.roleLabel')}
            value={role}
            options={ROLES.map((value) => ({ value, label: t(`roles.${value}`) }))}
            onValueChange={(value) => setRole(value as (typeof ROLES)[number])}
          />
          <Select
            label={t('members.presetLabel')}
            value={preset}
            options={PRESETS.map((value) => ({ value, label: t(`members.presets.${value}`) }))}
            onValueChange={(value) => setPreset(value as Preset)}
          />
        </div>
        {CAN_APPROVE.includes(preset) && (
          <FieldShell id="member-cap" label={t('members.approveLabel')} hint={t('members.approveHint')}>
            {(describedBy) => (
              <MoneyInput
                id="member-cap"
                aria-describedby={describedBy}
                currency={currency}
                value={cap}
                onValueChange={setCap}
              />
            )}
          </FieldShell>
        )}
        <div>
          <Button type="submit" loading={saving}>
            {t('members.add')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
