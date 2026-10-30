import { createEventDraft } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { S3Storage } from '@tiwa/storage';
import { afterAll, describe, expect, it } from 'vitest';
import { handleGuestCsvImport } from './csv-import.js';

const users: string[] = [];
const mine: string[] = [];

const fakeLog = { info: () => undefined } as unknown as Parameters<typeof handleGuestCsvImport>[1];

async function makeHost() {
  const user = await prisma.user.create({ data: { name: 'Host', countryCode: 'NG' } });
  users.push(user.id);
  return { kind: 'user' as const, userId: user.id, isAdmin: false };
}

afterAll(async () => {
  await prisma.guest.deleteMany({ where: { eventId: { in: mine } } });
  await prisma.guestGroup.deleteMany({ where: { eventId: { in: mine } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: mine } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ targetId: { in: mine } }, { actorId: { in: users } }] },
  });
  await prisma.event.deleteMany({ where: { id: { in: mine } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

describe('guests.import', () => {
  it('no-ops when the file is gone (already imported or re-run)', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    mine.push(eventId);
    const result = await handleGuestCsvImport(
      { eventId, fileKey: 'events/nope/missing.csv', mapping: { name: 0 }, userId: host.userId, totalRows: 1 },
      fakeLog,
    );
    expect(result).toEqual({ imported: 0, warnings: 0, groupsCreated: 0 });
  });
});

// Full run against the local S3 mock (skipped when it is down).
const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9090';
const reachable = await fetch(endpoint, { signal: AbortSignal.timeout(1000) }).then(
  () => true,
  () => false,
);

describe.runIf(reachable)('guests.import against the S3 mock', () => {
  it('imports rows, creates groups and deletes the file', async () => {
    const host = await makeHost();
    const { eventId } = await createEventDraft(host, { type: 'birthday' });
    mine.push(eventId);
    const store = new S3Storage({
      endpoint,
      region: 'auto',
      bucket: process.env.S3_BUCKET_PRIVATE ?? 'tiwa-media-private',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'test',
    });
    const key = `events/${eventId}/imports/test-${Date.now()}.csv`;
    const csv = [
      'Full Name,Mobile,E-Mail,Category',
      'Adaeze Okafor,08031234567,ada@example.com,Family',
      'Bob Stone,,,Friends',
    ].join('\n');
    await store.put(key, new TextEncoder().encode(csv), 'text/csv');

    const result = await handleGuestCsvImport(
      { eventId, fileKey: key, mapping: { name: 0, phone: 1, email: 2, group: 3 }, userId: host.userId, totalRows: 2 },
      fakeLog,
    );
    expect(result).toEqual({ imported: 2, warnings: 0, groupsCreated: 2 });
    const guests = await prisma.guest.findMany({ where: { eventId }, orderBy: { name: 'asc' } });
    expect(guests.map((guest) => [guest.name, guest.phone, guest.source])).toEqual([
      ['Adaeze Okafor', '+2348031234567', 'CSV'],
      ['Bob Stone', null, 'CSV'],
    ]);
    const groups = await prisma.guestGroup.findMany({ where: { eventId } });
    expect(groups.map((group) => group.name).sort()).toEqual(['Family', 'Friends']);
    expect(await store.head(key)).toBeNull();
  });
});
