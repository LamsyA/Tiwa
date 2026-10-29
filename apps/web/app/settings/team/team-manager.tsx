'use client';

import type { MemberRow } from '@tiwa/core';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  FieldShell,
  Input,
  SegmentedControl,
  StatusPill,
} from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { ActionResult } from '@/lib/action.js';
import { changeTeamRole, inviteTeamMember, removeTeamMember } from './actions.js';

type Role = MemberRow['role'];
const RANK: Record<Role, number> = { OWNER: 3, ADMIN: 2, STAFF: 1 };

interface Props {
  orgId: string;
  orgName: string;
  me: string;
  myRole: Role;
  members: MemberRow[];
  orgs: { id: string; name: string }[];
}

export function TeamManager({ orgId, orgName, me, myRole, members, orgs }: Props) {
  const t = useTranslations('settings.team');
  const router = useRouter();
  const [status, setStatus] = React.useState<{ tone: 'info' | 'warning' | 'danger'; text: string } | null>(null);
  const canManage = RANK[myRole] >= RANK.ADMIN;

  function errorText(result: Extract<ActionResult<unknown>, { ok: false }>, conflictKey = 'CONFLICT'): string {
    if (result.code === 'CONFLICT') return t(`errors.${conflictKey}`);
    if (result.code === 'FORBIDDEN' || result.code === 'VALIDATION') return t(`errors.${result.code}`);
    return t('errors.generic');
  }

  async function run(work: () => Promise<ActionResult<unknown>>, conflictKey?: string) {
    setStatus(null);
    const result = await work();
    if (!result.ok) setStatus({ tone: 'danger', text: errorText(result, conflictKey) });
    else router.refresh();
    return result;
  }

  return (
    <div className="flex flex-col gap-6 py-4">
      {orgs.length > 1 && (
        <SegmentedControl
          ariaLabel={t('orgSwitch')}
          value={orgId}
          onValueChange={(value) => value && router.push(`/settings/team?org=${value}`)}
          options={orgs.map((org) => ({ value: org.id, label: org.name }))}
        />
      )}
      <h2 className="font-display text-xl font-bold">{t('heading', { org: orgName })}</h2>
      {status && <Banner tone={status.tone}>{status.text}</Banner>}

      {canManage && (
        <InviteForm
          orgId={orgId}
          myRole={myRole}
          onDone={(text, tone) => {
            setStatus({ tone, text });
            router.refresh();
          }}
        />
      )}

      <section aria-labelledby="members-heading">
        <h3 id="members-heading" className="mb-2 font-medium">
          {t('membersHeading')}
        </h3>
        <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
          {members.map((member) => {
            const self = member.userId === me;
            const outranked = RANK[myRole] > RANK[member.role];
            const name = member.name || member.contact || t('unnamed');
            return (
              <li key={member.userId} className="flex flex-wrap items-center gap-3 p-3">
                <Avatar name={name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {name} {self && <span className="text-muted text-sm">({t('you')})</span>}
                  </p>
                  {member.contact && member.name && <p className="text-muted truncate text-sm">{member.contact}</p>}
                </div>
                {!member.joined && <StatusPill tone="warning">{t('pending')}</StatusPill>}
                <Badge tone={member.role === 'OWNER' ? 'brand' : 'neutral'}>{t(`role${member.role}`)}</Badge>
                <div className="flex gap-2">
                  {canManage && outranked && member.role === 'STAFF' && myRole === 'OWNER' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void run(() => changeTeamRole({ orgId, userId: member.userId, role: 'ADMIN' }))}
                    >
                      {t('makeAdmin')}
                    </Button>
                  )}
                  {canManage && outranked && member.role === 'ADMIN' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void run(() => changeTeamRole({ orgId, userId: member.userId, role: 'STAFF' }))}
                    >
                      {t('makeStaff')}
                    </Button>
                  )}
                  {(self || (canManage && outranked)) && (
                    <ConfirmDialog
                      destructive
                      trigger={
                        <Button size="sm" variant="ghost">
                          {self ? t('leave') : t('remove')}
                        </Button>
                      }
                      title={self ? t('leaveTitle') : t('removeTitle', { name })}
                      body={self ? t('leaveBody') : t('removeBody')}
                      confirmLabel={self ? t('leave') : t('remove')}
                      onConfirm={() =>
                        void run(() => removeTeamMember({ orgId, userId: member.userId }), 'lastOwner').then(
                          (result) => {
                            if (result.ok && self) router.push('/home');
                          },
                        )
                      }
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function InviteForm({
  orgId,
  myRole,
  onDone,
}: {
  orgId: string;
  myRole: Role;
  onDone: (text: string, tone: 'info' | 'warning') => void;
}) {
  const t = useTranslations('settings.team');
  const roles: Role[] = myRole === 'OWNER' ? ['STAFF', 'ADMIN'] : ['STAFF'];
  const [by, setBy] = React.useState<'phone' | 'email'>('phone');
  const [contact, setContact] = React.useState('');
  const [role, setRole] = React.useState<Role>('STAFF');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function submit() {
    setError(undefined);
    setSaving(true);
    try {
      const result = await inviteTeamMember({ orgId, role, [by]: contact });
      if (result.ok) {
        setContact('');
        onDone(result.data.sent ? t('invited') : t('invitedNotSent'), result.data.sent ? 'info' : 'warning');
      } else if (result.fieldErrors) {
        const key = Object.values(result.fieldErrors).flat()[0];
        setError(
          t(`errors.${key && ['invalidPhone', 'invalidEmail', 'phoneOrEmail'].includes(key) ? key : 'VALIDATION'}`),
        );
      } else {
        setError(t(`errors.${result.code === 'CONFLICT' || result.code === 'FORBIDDEN' ? result.code : 'generic'}`));
      }
    } catch {
      setError(t('errors.generic'));
    } finally {
      setSaving(false);
    }
  }

  const fieldId = `invite-${by}`;
  return (
    <Card className="p-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h3 className="font-medium">{t('inviteHeading')}</h3>
        <SegmentedControl
          ariaLabel={t('inviteBy')}
          value={by}
          onValueChange={(value) => {
            if (value === 'phone' || value === 'email') {
              setBy(value);
              setContact('');
              setError(undefined);
            }
          }}
          options={[
            { value: 'phone', label: t('byPhone') },
            { value: 'email', label: t('byEmail') },
          ]}
        />
        <FieldShell id={fieldId} label={by === 'phone' ? t('phoneLabel') : t('emailLabel')} error={error}>
          {(describedBy) => (
            <Input
              id={fieldId}
              aria-describedby={describedBy}
              aria-invalid={Boolean(error)}
              type={by === 'phone' ? 'tel' : 'email'}
              inputMode={by === 'phone' ? 'tel' : 'email'}
              autoComplete="off"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
            />
          )}
        </FieldShell>
        {roles.length > 1 && (
          <div>
            <p id="invite-role-label" className="mb-1 text-sm font-medium">
              {t('roleLabel')}
            </p>
            <SegmentedControl
              ariaLabel={t('roleLabel')}
              value={role}
              onValueChange={(value) => value && setRole(value as Role)}
              options={roles.map((value) => ({ value, label: t(`role${value}`) }))}
            />
          </div>
        )}
        <p className="text-muted text-sm">{t(`roleHelp${role}`)}</p>
        <div>
          <Button type="submit" loading={saving}>
            {t('invite')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
