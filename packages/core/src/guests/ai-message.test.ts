import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createEventDraft } from '../events/commands.js';
import { permissionsFor, toStoredPermissions } from '../events/access.js';
import {
  cleanDraft,
  draftGuestMessage,
  sendDraftedMessage,
  type MessageDraftContext,
  type MessageDrafter,
} from './ai-message.js';
import { addGuests, createGroup } from './guests.js';
import { enableInvites } from './invites.js';

// UF-27 step 3 (D-X41): one prompt → draft; nothing sent until Send; the model
// never sees guest names, phones or emails; only guest managers may use it.

const users: string[] = [];
const events: string[] = [];

async function makeUser(name: string) {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

/** Records what the model was given and answers like a real one would. */
class RecordingDrafter implements MessageDrafter {
  contexts: MessageDraftContext[] = [];
  constructor(private readonly reply: Awaited<ReturnType<MessageDrafter['draftMessage']>>) {}
  async draftMessage(context: MessageDraftContext) {
    this.contexts.push(context);
    return this.reply;
  }
}

afterAll(async () => {
  await prisma.inviteDelivery.deleteMany({ where: { guest: { eventId: { in: events } } } });
  await prisma.inviteBatch.deleteMany({ where: { eventId: { in: events } } });
  await prisma.guest.deleteMany({ where: { eventId: { in: events } } });
  await prisma.guestGroup.deleteMany({ where: { eventId: { in: events } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

async function setup() {
  const host = await makeUser('AI Host');
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  events.push(eventId);
  await enableInvites(host, { eventId, enabled: true });
  const { groupId } = await createGroup(host, { eventId, name: 'Family', color: null });
  await addGuests(host, {
    eventId,
    guests: [
      { name: 'Adaeze Okafor', phone: '08031234567', email: 'adaeze@example.com', groupIds: [groupId] },
      { name: 'Bolaji Ade', email: 'bolaji@example.com', groupIds: [] },
      { name: 'Chidi Nocontact', groupIds: [] },
    ],
  });
  return { host, eventId, groupId };
}

const reply = {
  message: 'Hi {name}, the venue has moved to Eko Hotel. See the details: {link}',
  kind: 'UPDATE' as const,
  audience: 'group' as const,
  groupName: 'family',
  headline: 'Venue change for family',
};

describe('one-prompt guest messages (D-X41)', () => {
  it('drafts without sending, and the model never sees guest contact details or names', async () => {
    const { host, eventId, groupId } = await setup();
    const drafter = new RecordingDrafter(reply);
    const draft = await draftGuestMessage(drafter, host, {
      eventId,
      prompt: 'Tell the family the venue moved to Eko Hotel. Call me on 08099998888 or mail me@host.com',
    });

    // Rule 1: nothing is sent — no batch, no deliveries.
    expect(await prisma.inviteBatch.count({ where: { eventId } })).toBe(0);

    // Rule 2: no guest names, phones or emails in what the model saw; typed contacts are masked.
    const seen = JSON.stringify(drafter.contexts[0]);
    for (const secret of ['Adaeze', 'Bolaji', 'Chidi', '08031234567', 'adaeze@example.com', 'bolaji@example.com']) {
      expect(seen).not.toContain(secret);
    }
    expect(seen).not.toContain('08099998888');
    expect(seen).not.toContain('me@host.com');
    expect(drafter.contexts[0]!.guestCounts.total).toBe(3);
    expect(drafter.contexts[0]!.groups).toEqual(['Family']);

    expect(draft.kind).toBe('UPDATE');
    expect(draft.audience).toEqual({ type: 'group', groupId });
    expect(draft.estimate.total).toBe(1);
    expect(draft.estimate.sample?.firstName).toBe('Adaeze');
    expect(draft.options.find((option) => option.key === 'all')?.total).toBe(2);
  });

  it('only guest managers can draft or send', async () => {
    const { eventId } = await setup();
    const viewer = await makeUser('AI Viewer');
    await prisma.eventParticipant.create({
      data: {
        eventId,
        userId: viewer.userId,
        role: 'CO_HOST',
        permissions: toStoredPermissions(permissionsFor('CO_HOST', 'view_only')),
      },
    });
    const drafter = new RecordingDrafter(reply);
    await expect(draftGuestMessage(drafter, viewer, { eventId, prompt: 'Invite everyone' })).rejects.toThrow();
    expect(drafter.contexts).toHaveLength(0);
    await expect(
      sendDraftedMessage(viewer, {
        eventId,
        audience: { type: 'all' },
        kind: 'INVITE',
        message: 'Hi {name} {link}',
        idempotencyKey: 'ai-viewer-0001',
      }),
    ).rejects.toThrow();
    expect(await prisma.inviteBatch.count({ where: { eventId } })).toBe(0);
  });

  it('Send queues exactly the reviewed text to reachable guests', async () => {
    const { host, eventId } = await setup();
    const text = 'Hi {name}, small change: we start at 7pm now. Details: {link}';
    const sent = await sendDraftedMessage(host, {
      eventId,
      audience: { type: 'all' },
      kind: 'UPDATE',
      message: text,
      idempotencyKey: `ai-send-${eventId.slice(0, 8)}`,
    });
    expect(sent.queued).toBe(2);
    expect(sent.unreachable).toBe(1);
    const batch = await prisma.inviteBatch.findUniqueOrThrow({ where: { id: sent.batchId } });
    expect(batch.message).toBe(text);
    expect(batch.status).toBe('QUEUED');
    expect(batch.kind).toBe('UPDATE');
  });

  it('cleanDraft keeps the placeholders and strips contact details and links', () => {
    const cleaned = cleanDraft('Come through! Call 08031234567 or visit https://evil.example', 'NG');
    expect(cleaned).toContain('{name}');
    expect(cleaned).toContain('{link}');
    expect(cleaned).not.toContain('08031234567');
    expect(cleaned).not.toContain('evil.example');
  });
});
