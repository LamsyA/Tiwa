import { createEventDraft } from '@tiwa/core';
import { addGuests } from '@tiwa/core';
import { createInviteBatch, sendInviteBatch } from '@tiwa/core';
import { enableInvites } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { FakeEmail, FakeSms, FakeWhatsApp } from '@tiwa/messaging';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setProvidersForTests } from './providers.js';
import { handleInviteBatchQueued, handleSendInvite } from './send-invite.js';

const users: string[] = [];
const events: string[] = [];
let fakes: { email: FakeEmail; sms: FakeSms; whatsapp: FakeWhatsApp };

const fakeLog = { info: () => undefined } as unknown as Parameters<typeof handleSendInvite>[1];

function fakeSink() {
  const jobs: { name: string; data: unknown; jobId: string }[] = [];
  return {
    jobs,
    sink: {
      async add(name: string, data: unknown, opts: { jobId: string }) {
        if (!jobs.some((job) => job.jobId === opts.jobId)) jobs.push({ name, data, jobId: opts.jobId });
      },
    } as unknown as Parameters<typeof handleInviteBatchQueued>[2],
  };
}

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

async function batchFixture(channels: ('WHATSAPP' | 'EMAIL' | 'SMS' | 'LINK')[] = ['WHATSAPP', 'EMAIL', 'SMS']) {
  const host = await makeHost();
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  events.push(eventId);
  await enableInvites(host, { eventId, enabled: true });
  await addGuests(host, {
    eventId,
    guests: [
      { name: 'Ada', phone: '08031234567', email: 'ada@example.com', groupIds: [] },
      { name: 'Bob', email: 'bob@example.com', groupIds: [] },
    ],
  });
  const preview = await createInviteBatch(host, {
    eventId,
    audience: { type: 'all' },
    channels,
    smart: true,
    message: 'Hi {name}, join us! {link}',
    kind: 'INVITE',
  });
  await sendInviteBatch(host, { batchId: preview.batchId, idempotencyKey: `t07-${Date.now()}-${Math.random()}` });
  await prisma.outboxEvent.deleteMany({ where: { topic: 'invite.batch.queued' } });
  return { host, eventId, batchId: preview.batchId };
}

beforeEach(() => {
  fakes = { email: new FakeEmail(), sms: new FakeSms(), whatsapp: new FakeWhatsApp() };
  setProvidersForTests(fakes);
});

afterAll(async () => {
  await prisma.inviteDelivery.deleteMany({ where: { guest: { eventId: { in: events } } } });
  await prisma.inviteBatch.deleteMany({ where: { eventId: { in: events } } });
  await prisma.guest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.guestGroup.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: events } } });
  await prisma.idempotencyKey.deleteMany({ where: { scope: 'invite-batch' } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});

describe('invite fan-out', () => {
  it('routes WHATSAPP per the bulk flag and enqueues one job per provider delivery', async () => {
    vi.stubEnv('FLAG_WHATSAPP_BULK', '1');
    const { batchId } = await batchFixture();
    const { sink, jobs } = fakeSink();
    const result = await handleInviteBatchQueued({ batchId }, fakeLog, sink);
    expect(result).toEqual({ enqueued: 2 });
    expect(jobs.map((job) => job.name)).toEqual(['messaging/send-invite', 'messaging/send-invite']);
    // Re-run dedupes (same jobIds) — fan-out is idempotent.
    const again = await handleInviteBatchQueued({ batchId }, fakeLog, sink);
    expect(again).toEqual({ enqueued: 2 });
    expect(jobs).toHaveLength(2);
    const channels = await prisma.inviteDelivery.findMany({ where: { batchId }, select: { channel: true } });
    expect(channels.map((row) => row.channel).sort()).toEqual(['EMAIL', 'WHATSAPP_API']);
  });

  it('leaves WHATSAPP_FREE deliveries queued for the manual queue (flag off)', async () => {
    vi.stubEnv('FLAG_WHATSAPP_BULK', '0');
    const { batchId } = await batchFixture(['WHATSAPP']);
    const { sink, jobs } = fakeSink();
    const result = await handleInviteBatchQueued({ batchId }, fakeLog, sink);
    expect(result).toEqual({ enqueued: 0 });
    expect(jobs).toEqual([]);
    const rows = await prisma.inviteDelivery.findMany({ where: { batchId } });
    expect(rows.map((row) => `${row.channel}:${row.status}`)).toEqual(['WHATSAPP_FREE:QUEUED']);
    const batch = await prisma.inviteBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch.status).toBe('SENDING');
  });

  it('marks LINK deliveries sent with no jobs', async () => {
    vi.stubEnv('FLAG_WHATSAPP_BULK', '0');
    const { batchId } = await batchFixture(['LINK']);
    const { sink } = fakeSink();
    await handleInviteBatchQueued({ batchId }, fakeLog, sink);
    const rows = await prisma.inviteDelivery.findMany({ where: { batchId } });
    expect(rows.every((row) => row.status === 'SENT')).toBe(true);
    const batch = await prisma.inviteBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch.status).toBe('DONE');
  });
});

describe('send-invite', () => {
  it('sends email with one-tap links and SMS with the personal link', async () => {
    vi.stubEnv('FLAG_WHATSAPP_BULK', '1');
    const { batchId } = await batchFixture(['EMAIL', 'SMS']);
    const { sink, jobs } = fakeSink();
    await handleInviteBatchQueued({ batchId }, fakeLog, sink);
    for (const job of jobs) {
      await handleSendInvite(job.data, fakeLog);
    }
    // Smart order is WhatsApp → Email → SMS; with only Email+SMS selected both guests resolve to Email.
    expect(fakes.sms.sent).toHaveLength(0);
    expect(fakes.email.sent).toHaveLength(2);
    const html = fakes.email.sent[0]?.html ?? '';
    expect(html).toContain('/i/');
    expect(html).toContain('r=yes');
    expect(html).toContain('r=no');
    const batch = await prisma.inviteBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch.status).toBe('DONE');
  });

  it('sends WhatsApp templates with RSVP button payloads', async () => {
    vi.stubEnv('FLAG_WHATSAPP_BULK', '1');
    const { batchId } = await batchFixture(['WHATSAPP']);
    const { sink, jobs } = fakeSink();
    await handleInviteBatchQueued({ batchId }, fakeLog, sink);
    expect(jobs).toHaveLength(1);
    await handleSendInvite(jobs[0]?.data, fakeLog);
    expect(fakes.whatsapp.sent).toHaveLength(1);
    const sent = fakes.whatsapp.sent[0];
    expect(sent?.template).toBe('tiwa_invite_v1');
    expect(sent?.buttons?.map((button) => button.id).sort()).toEqual(
      expect.arrayContaining([expect.stringMatching(/^rsvp:no:/)]),
    );
    expect(sent?.buttons?.map((button) => button.id).sort()).toEqual(
      expect.arrayContaining([expect.stringMatching(/^rsvp:yes:/)]),
    );
  });

  it('skips replays and fails removed guests without sending', async () => {
    vi.stubEnv('FLAG_WHATSAPP_BULK', '1');
    const { batchId } = await batchFixture(['EMAIL']);
    const { sink, jobs } = fakeSink();
    await handleInviteBatchQueued({ batchId }, fakeLog, sink);
    const first = jobs[0]?.data;
    expect(await handleSendInvite(first, fakeLog)).toEqual({ status: 'SENT' });
    expect(await handleSendInvite(first, fakeLog)).toEqual({ status: 'SENT' });
    expect(fakes.email.sent).toHaveLength(1);

    const target = await prisma.inviteBatch.findUniqueOrThrow({ where: { id: batchId } });
    await prisma.guest.updateMany({ where: { eventId: target.eventId }, data: { deletedAt: new Date() } });
    const second = jobs[1]?.data;
    if (second) expect(await handleSendInvite(second, fakeLog)).toEqual({ status: 'FAILED' });
    expect(fakes.email.sent).toHaveLength(1);
  });
});
