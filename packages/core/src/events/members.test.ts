import { prisma } from '@tiwa/db';
import { afterAll, describe, expect, it } from 'vitest';
import { authorize, type Actor } from '../auth/authorize.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { loadEventAccess } from './access.js';
import { createEventDraft } from './commands.js';
import { addParticipant, listParticipants, removeParticipant, updateParticipant } from './members.js';

type UserActor = Extract<Actor, { kind: 'user' }>;
const RUN = String(Date.now()).slice(-6);
const users: string[] = [];
let phoneSeq = 0;
const phone = () => `0803${RUN}${(phoneSeq += 1)}`.slice(0, 11);

async function makeUser(name = 'Host'): Promise<UserActor> {
  const user = await prisma.user.create({ data: { name, countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user', userId: user.id, isAdmin: false };
}
const asActor = (userId: string): UserActor => ({ kind: 'user', userId, isAdmin: false });

afterAll(async () => {
  const events = await prisma.event.findMany({ where: { createdById: { in: users } }, select: { id: true } });
  const ids = events.map((event) => event.id);
  const invited = await prisma.eventParticipant.findMany({ where: { eventId: { in: ids } }, select: { userId: true } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.outboxEvent.deleteMany({
    where: { OR: ids.map((id) => ({ payload: { path: ['eventId'], equals: id } })) },
  });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: ids } } });
  await prisma.event.deleteMany({ where: { id: { in: ids } } });
  const all = [...users, ...invited.map((row) => row.userId).filter((id): id is string => Boolean(id))];
  await prisma.user.deleteMany({ where: { id: { in: all } } });
  await prisma.$disconnect();
});

async function eventWithHost() {
  const host = await makeUser();
  const { eventId } = await createEventDraft(host, { type: 'birthday' });
  return { host, eventId };
}

describe('addParticipant (EVT-06, UF-04 step 1)', () => {
  it('invites by phone with a preset; the invitee is pending until they visit', async () => {
    const { host, eventId } = await eventWithHost();
    const invite = await addParticipant(host, { eventId, phone: phone(), role: 'CO_HOST', preset: 'contributor' });
    expect(invite).toMatchObject({ created: true, channel: 'sms', eventId });
    expect(invite.to).toMatch(/^\+234803/);
    const access = await loadEventAccess(invite.userId, eventId);
    expect(access?.role).toBe('CO_HOST');
    expect(access?.permissions.preset).toBe('contributor');
    const list = await listParticipants(host, eventId);
    expect(list.members.find((member) => member.userId === invite.userId)).toMatchObject({
      joined: false,
      contact: invite.to,
    });
  });

  it('refuses duplicates, bad contacts, and members without members.manage', async () => {
    const { host, eventId } = await eventWithHost();
    const number = phone();
    const first = await addParticipant(host, { eventId, phone: number, role: 'CO_HOST', preset: 'full' });
    await expect(
      addParticipant(host, { eventId, phone: number, role: 'CO_HOST', preset: 'full' }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      addParticipant(host, { eventId, phone: '12', role: 'CO_HOST', preset: 'full' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      addParticipant(asActor(first.userId), { eventId, phone: phone(), role: 'CO_HOST', preset: 'full' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('hides contact details from members who cannot manage the team', async () => {
    const { host, eventId } = await eventWithHost();
    const member = await addParticipant(host, { eventId, phone: phone(), role: 'CO_HOST', preset: 'view_only' });
    const seen = await listParticipants(asActor(member.userId), eventId);
    expect(seen.canManage).toBe(false);
    expect(seen.members.every((row) => row.contact === null)).toBe(true);
  });
});

describe('UF-04 acceptance at the permission layer', () => {
  it('UF-04-1: a View only co-host cannot view money', async () => {
    const { host, eventId } = await eventWithHost();
    const member = await addParticipant(host, { eventId, phone: phone(), role: 'CO_HOST', preset: 'view_only' });
    const access = await loadEventAccess(member.userId, eventId);
    expect(() => authorize(asActor(member.userId), 'money.view', { eventId, access })).toThrow(ForbiddenError);
    expect(() => authorize(asActor(member.userId), 'event.view', { eventId, access })).not.toThrow();
  });

  it('UF-04-2: Finance up to 100,000 approves 80,000 but not 150,000 (minor units)', async () => {
    const { host, eventId } = await eventWithHost();
    const member = await addParticipant(host, {
      eventId,
      email: `fin${RUN}@example.com`,
      role: 'CO_HOST',
      preset: 'finance',
      approveUpToMinor: '10000000',
    });
    const actor = asActor(member.userId);
    const access = await loadEventAccess(member.userId, eventId);
    expect(() => authorize(actor, 'quote.accept', { eventId, access, amountMinor: 8_000_000n })).not.toThrow();
    expect(() => authorize(actor, 'quote.accept', { eventId, access, amountMinor: 15_000_000n })).toThrow(
      ForbiddenError,
    );
  });

  it('UF-04-3: removal blocks the next request; the host cannot be removed or changed', async () => {
    const { host, eventId } = await eventWithHost();
    const member = await addParticipant(host, { eventId, phone: phone(), role: 'PLANNER', preset: 'full' });
    expect(await loadEventAccess(member.userId, eventId)).not.toBeNull();
    await removeParticipant(host, { eventId, participantId: member.participantId });
    expect(await loadEventAccess(member.userId, eventId)).toBeNull();

    const hostRow = await prisma.eventParticipant.findFirstOrThrow({ where: { eventId, role: 'HOST' } });
    await expect(removeParticipant(host, { eventId, participantId: hostRow.id })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      updateParticipant(host, { eventId, participantId: hostRow.id, preset: 'view_only' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeParticipant(host, { eventId, participantId: member.participantId })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('changing a preset applies on the next request', async () => {
    const { host, eventId } = await eventWithHost();
    const member = await addParticipant(host, { eventId, phone: phone(), role: 'CO_HOST', preset: 'view_only' });
    await updateParticipant(host, {
      eventId,
      participantId: member.participantId,
      preset: 'finance',
      approveUpToMinor: null,
    });
    const access = await loadEventAccess(member.userId, eventId);
    expect(access?.permissions.money).toBe('edit');
    expect(access?.permissions.approveUpToMinor).toBeNull();
  });
});
