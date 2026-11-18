import { env } from '@tiwa/config';
import type { EventInviteResult, InviteResult } from '@tiwa/core';
import { renderTeamInviteEmail } from '@tiwa/messaging';
import { emailSender, smsSender } from './auth.js';

/**
 * Tell an invited team member where to sign in (P2-T07). Sending failures
 * never undo the membership: the caller shows "share the link yourself".
 * Moves to packages/messaging templates with P4.
 */
export async function notifyTeamInvite(invite: InviteResult): Promise<{ sent: boolean }> {
  // D-X88: land on Home, which shows the events they're assigned to.
  const link = `${env.APP_URL.replace(/\/$/, '')}/login?next=${encodeURIComponent('/home')}`;
  try {
    if (invite.channel === 'sms') {
      await smsSender.send({
        to: invite.to,
        body: `You've been added to the ${invite.orgName} team on Tiwa. Sign in with this number: ${link}`,
      });
    } else {
      const message = await renderTeamInviteEmail({ orgName: invite.orgName, role: invite.role, url: link });
      await emailSender.send({ to: invite.to, subject: message.subject, html: message.html });
    }
    return { sent: true };
  } catch {
    return { sent: false };
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** EVT-06: tell an invited co-host or planner where to sign in; the link lands on the event (UF-04 step 2). */
export async function notifyEventInvite(invite: EventInviteResult): Promise<{ sent: boolean }> {
  const link = `${env.APP_URL}/login?next=${encodeURIComponent(`/events/${invite.eventId}`)}`;
  try {
    if (invite.channel === 'sms') {
      await smsSender.send({
        to: invite.to,
        body: `You've been added to "${invite.eventName}" on Tiwa. Open: ${link}`,
      });
    } else {
      await emailSender.send({
        to: invite.to,
        subject: `You've been added to ${invite.eventName} on Tiwa`,
        html: `<p>You've been added to <strong>${escapeHtml(invite.eventName)}</strong> on Tiwa.</p><p><a href="${link}">Open the event</a></p>`,
      });
    }
    return { sent: true };
  } catch {
    return { sent: false };
  }
}
