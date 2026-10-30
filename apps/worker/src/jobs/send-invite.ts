import { createElement } from 'react';
import { WHATSAPP_TEMPLATES, env } from '@tiwa/config';
import { createLogger, isEnabled, rsvpLink } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { InviteEmail, ReminderEmail, UpdateEmail, type EmailProvider } from '@tiwa/messaging';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { providers } from './providers.js';
import { acquire } from './rate-limiter.js';

type Log = ReturnType<typeof createLogger>;

// Backend.md §10: `messaging/send-invite-batch` fans out of
// `invite.batch.queued`; one `send-invite` job per provider delivery.
// LINK/QR need no transmission (marked SENT at fan-out); WHATSAPP_FREE
// waits in the host's manual queue (P4-T08). Every state change publishes
// to `invites:{eventId}` for the live tracking table (UF-07-4).

export const INVITE_BATCH_QUEUED_TOPIC = 'invite.batch.queued' as const;
export const SEND_INVITE_JOB = 'messaging/send-invite' as const;

export interface FanOutSink {
  add(
    name: string,
    data: unknown,
    opts: {
      jobId: string;
      attempts: number;
      backoff: { type: 'exponential'; delay: number };
      removeOnComplete: number;
      removeOnFail: number;
    },
  ): Promise<unknown>;
}

const globalLive = globalThis as unknown as { __tiwaWorkerInvites?: Redis };

function live(): Redis {
  globalLive.__tiwaWorkerInvites ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
  globalLive.__tiwaWorkerInvites.on('error', () => undefined);
  return globalLive.__tiwaWorkerInvites;
}

export async function publishInvites(eventId: string): Promise<void> {
  await live()
    .publish(`invites:${eventId}`, JSON.stringify({ kind: 'invites', at: Date.now() }))
    .catch(() => undefined);
}

const batchPayloadSchema = z.object({ batchId: z.string().uuid() });

/**
 * Fan out one batch: route WHATSAPP per the bulk flag, mark LINK/QR sent,
 * enqueue provider sends (jobId = delivery id, so re-runs dedupe). The
 * batch flips QUEUED → SENDING, or straight to DONE when nothing needs a
 * provider (link-only batches, free-mode batches with no API/Email/SMS).
 */
export async function handleInviteBatchQueued(
  data: unknown,
  log: Log,
  sink: FanOutSink,
): Promise<{ enqueued: number }> {
  const { batchId } = batchPayloadSchema.parse(data);
  const batch = await prisma.inviteBatch.findUniqueOrThrow({ where: { id: batchId } });
  const event = await prisma.event.findUniqueOrThrow({ where: { id: batch.eventId }, select: { countryCode: true } });
  const bulk = await isEnabled('whatsapp.bulk', event.countryCode);
  const resolved = bulk ? 'WHATSAPP_API' : 'WHATSAPP_FREE';

  await prisma.$transaction(async (tx) => {
    await tx.inviteDelivery.updateMany({ where: { batchId, channel: 'WHATSAPP' }, data: { channel: resolved } });
    await tx.inviteDelivery.updateMany({
      where: { batchId, channel: { in: ['LINK', 'QR'] }, status: 'QUEUED' },
      data: { status: 'SENT' },
    });
    await tx.inviteBatch.updateMany({ where: { id: batchId, status: 'QUEUED' }, data: { status: 'SENDING' } });
  });

  const sendable = await prisma.inviteDelivery.findMany({
    where: { batchId, channel: { in: ['EMAIL', 'SMS', 'WHATSAPP_API'] }, status: 'QUEUED' },
    select: { id: true },
  });
  for (const delivery of sendable) {
    await sink.add(
      SEND_INVITE_JOB,
      { deliveryId: delivery.id },
      {
        // NOTE: BullMQ custom ids reject ':' — dashes, not colons.
        jobId: `send-invite-${delivery.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }
  if (sendable.length === 0) {
    // Nothing to transmit — but free-mode deliveries still wait for the host.
    const waiting = await prisma.inviteDelivery.count({ where: { batchId, status: 'QUEUED' } });
    if (waiting === 0) {
      await prisma.inviteBatch.updateMany({ where: { id: batchId, status: 'SENDING' }, data: { status: 'DONE' } });
    }
  }
  log.info(
    { topic: INVITE_BATCH_QUEUED_TOPIC, batchId, enqueued: sendable.length, whatsapp: resolved },
    'batch fanned out',
  );
  await publishInvites(batch.eventId);
  return { enqueued: sendable.length };
}

const sendPayloadSchema = z.object({ deliveryId: z.string().uuid() });

function renderText(template: string, vars: { name: string; link: string; event: string }): string {
  const rendered = template
    .replaceAll('{name}', vars.name)
    .replaceAll('{link}', vars.link)
    .replaceAll('{event}', vars.event);
  // The link is the RSVP path — if the host deleted the placeholder, append it.
  return rendered.includes(vars.link) ? rendered : `${rendered}\n${vars.link}`;
}

function dateLine(startsAt: Date | null, timezone: string): string {
  if (!startsAt) return '';
  return new Intl.DateTimeFormat('en', { dateStyle: 'full', timeStyle: 'short', timeZone: timezone }).format(startsAt);
}

/** One provider send. Skips non-QUEUED deliveries (replay-safe); FAILED keeps the error for retry display. */
export async function handleSendInvite(data: unknown, log: Log): Promise<{ status: string }> {
  const { deliveryId } = sendPayloadSchema.parse(data);
  const delivery = await prisma.inviteDelivery.findUnique({
    where: { id: deliveryId },
    include: { guest: { select: { id: true, name: true, phone: true, email: true, inviteToken: true } } },
  });
  if (!delivery || delivery.status !== 'QUEUED') {
    log.info({ job: SEND_INVITE_JOB, deliveryId }, 'already handled, skipping');
    return { status: delivery?.status ?? 'missing' };
  }
  const batch = await prisma.inviteBatch.findUniqueOrThrow({
    where: { id: delivery.batchId },
    select: { id: true, eventId: true, message: true, kind: true },
  });
  // Guest deleted or token revoked after compose → don't send; mark failed with the reason.
  const token = delivery.guest.inviteToken;
  const guest = await prisma.guest.findFirst({
    where: { id: delivery.guestId, deletedAt: null, inviteRevokedAt: null },
    select: { id: true },
  });
  if (!guest || !token) {
    await prisma.inviteDelivery.update({
      where: { id: deliveryId },
      data: { status: 'FAILED', error: 'guest-removed' },
    });
    await publishInvites(batch.eventId);
    return { status: 'FAILED' };
  }
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: batch.eventId },
    select: {
      name: true,
      startsAt: true,
      timezone: true,
      countryCode: true,
      createdById: true,
      days: { orderBy: { sortOrder: 'asc' }, take: 1, select: { venueName: true } },
    },
  });
  const host = await prisma.user.findUnique({ where: { id: event.createdById }, select: { name: true } });
  const appUrl = env.APP_URL.replace(/\/$/, '');
  const link = `${appUrl}/i/${token}`;
  const vars = { name: delivery.guest.name, link, event: event.name };
  const channel = delivery.channel;

  try {
    if (channel === 'EMAIL')
      await sendEmail({ id: delivery.id, guest: delivery.guest, batch }, event, vars, link, host?.name ?? null);
    else if (channel === 'SMS' || channel === 'WHATSAPP_API')
      await sendText(channel, { guest: delivery.guest, batch }, vars);
    else throw new Error(`unroutable channel in send job: ${channel}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.inviteDelivery.update({
      where: { id: deliveryId },
      data: { status: 'FAILED', error: message.slice(0, 280) },
    });
    await publishInvites(batch.eventId);
    log.info({ job: SEND_INVITE_JOB, deliveryId, channel, err: message.slice(0, 120) }, 'send failed');
    return { status: 'FAILED' };
  }
  await prisma.inviteDelivery.update({
    where: { id: deliveryId },
    data: { status: 'SENT', providerRef: 'sent', error: null },
  });
  await maybeCompleteBatch(batch.id);
  await publishInvites(batch.eventId);
  return { status: 'SENT' };
}

async function sendEmail(
  delivery: { id: string; guest: { name: string; email: string | null }; batch: { message: string; kind: string } },
  event: { name: string; startsAt: Date | null; timezone: string; days: { venueName: string | null }[] },
  vars: { name: string; link: string; event: string },
  link: string,
  hostName: string | null,
): Promise<void> {
  if (!delivery.guest.email) throw new Error('guest has no email');
  if (!(await acquire(live(), 'email'))) throw new Error('email rate limit timeout');
  if (!env.AUTH_SECRET) throw new Error('AUTH_SECRET is not set');
  const token = link.split('/i/')[1] ?? '';
  const kind = delivery.batch.kind as 'INVITE' | 'UPDATE' | 'REMINDER';
  const element =
    kind === 'UPDATE'
      ? createElement(UpdateEmail, {
          guestName: vars.name,
          eventName: event.name,
          headline: `News about ${event.name}`,
          body: varsBody(delivery.batch.message, vars),
          inviteUrl: link,
        })
      : kind === 'REMINDER'
        ? createElement(ReminderEmail, {
            guestName: vars.name,
            eventName: event.name,
            dateLine: dateLine(event.startsAt, event.timezone),
            yesUrl: rsvpLink(env.APP_URL, token, 'yes', env.AUTH_SECRET),
            noUrl: rsvpLink(env.APP_URL, token, 'no', env.AUTH_SECRET),
          })
        : createElement(InviteEmail, {
            guestName: vars.name,
            eventName: event.name,
            hostLine: hostName ? `Hosted by ${hostName}` : `An invitation for you`,
            dateLine: dateLine(event.startsAt, event.timezone),
            venueLine: event.days[0]?.venueName ?? undefined,
            message: varsBody(delivery.batch.message, vars),
            yesUrl: rsvpLink(env.APP_URL, token, 'yes', env.AUTH_SECRET),
            noUrl: rsvpLink(env.APP_URL, token, 'no', env.AUTH_SECRET),
            inviteUrl: link,
          });
  const email: EmailProvider = providers().email;
  await email.send({ to: delivery.guest.email, subject: subjectFor(kind, event.name), react: element });
}

function varsBody(template: string, vars: { name: string; link: string; event: string }): string {
  return template.replaceAll('{name}', vars.name).replaceAll('{link}', vars.link).replaceAll('{event}', vars.event);
}

function subjectFor(kind: string, eventName: string): string {
  if (kind === 'UPDATE') return `Update: ${eventName}`;
  if (kind === 'REMINDER') return `Reminder: ${eventName}`;
  return `You're invited: ${eventName}`;
}

async function sendText(
  channel: 'SMS' | 'WHATSAPP_API',
  delivery: { guest: { name: string; phone: string | null }; batch: { message: string; kind: string } },
  vars: { name: string; link: string; event: string },
): Promise<void> {
  if (!delivery.guest.phone) throw new Error('guest has no phone');
  const provider = channel === 'SMS' ? 'sms' : 'whatsapp';
  if (!(await acquire(live(), provider))) throw new Error(`${provider} rate limit timeout`);
  if (channel === 'SMS') {
    await providers().sms.send({ to: delivery.guest.phone, text: renderText(delivery.batch.message, vars) });
    return;
  }
  const kind = delivery.batch.kind as 'INVITE' | 'UPDATE' | 'REMINDER';
  const token = vars.link.split('/i/')[1] ?? '';
  await providers().whatsapp.sendTemplate({
    to: delivery.guest.phone,
    template: WHATSAPP_TEMPLATES[kind] ?? WHATSAPP_TEMPLATES.INVITE,
    lang: 'en',
    params: [vars.name, vars.event],
    buttons: [
      { id: `rsvp:yes:${token}`, title: "I'm coming" },
      { id: `rsvp:no:${token}`, title: "Can't come" },
    ],
  });
}

async function maybeCompleteBatch(batchId: string): Promise<void> {
  const waiting = await prisma.inviteDelivery.count({ where: { batchId, status: 'QUEUED' } });
  if (waiting === 0) {
    await prisma.inviteBatch.updateMany({
      where: { id: batchId, status: { in: ['SENDING', 'QUEUED'] } },
      data: { status: 'DONE' },
    });
    // Batch completion is worth one audit row (deliveries aren't audited individually — too noisy).
    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorType: 'system',
        action: 'invites.batchDone',
        targetType: 'InviteBatch',
        targetId: batchId,
        data: {},
      },
    });
  }
}
