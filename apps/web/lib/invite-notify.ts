import { env } from '@tiwa/config';
import type { InviteResult } from '@tiwa/core';
import { emailSender, smsSender } from './auth.js';

/**
 * Tell an invited team member where to sign in (P2-T07). Sending failures
 * never undo the membership: the caller shows "share the link yourself".
 * Moves to packages/messaging templates with P4.
 */
export async function notifyTeamInvite(invite: InviteResult): Promise<{ sent: boolean }> {
  const link = `${env.APP_URL}/login?next=${encodeURIComponent('/settings/team')}`;
  try {
    if (invite.channel === 'sms') {
      await smsSender.send({ to: invite.to, body: `You've been added to ${invite.orgName} on Tiwa. Sign in: ${link}` });
    } else {
      await emailSender.send({
        to: invite.to,
        subject: `You've been added to ${invite.orgName} on Tiwa`,
        html: `<p>You've been added to the ${escapeHtml(invite.orgName)} team on Tiwa.</p><p><a href="${link}">Sign in to get started</a></p>`,
      });
    }
    return { sent: true };
  } catch {
    return { sent: false };
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
