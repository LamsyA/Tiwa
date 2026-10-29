'use server';

import {
  inviteMember,
  inviteMemberSchema,
  removeMember,
  removeMemberSchema,
  updateMemberRole,
  updateMemberRoleSchema,
} from '@tiwa/core';
import { revalidatePath } from 'next/cache';
import { userAction } from '@/lib/ctx.js';
import { notifyTeamInvite } from '@/lib/invite-notify.js';

export const inviteTeamMember = userAction(inviteMemberSchema, async (input, ctx) => {
  const invite = await inviteMember(ctx.actor, input);
  const { sent } = await notifyTeamInvite(invite);
  revalidatePath('/settings/team');
  return { sent };
});

export const changeTeamRole = userAction(updateMemberRoleSchema, async (input, ctx) => {
  await updateMemberRole(ctx.actor, input);
  revalidatePath('/settings/team');
});

export const removeTeamMember = userAction(removeMemberSchema, async (input, ctx) => {
  await removeMember(ctx.actor, input);
  revalidatePath('/settings/team');
});
