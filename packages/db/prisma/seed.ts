import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { EVENT_TYPES, TIMEFRAME_DAYS_BEFORE, getEventType } from '@tiwa/config';
import { prisma } from '../src/index.js';

/** 32 random bytes, base64url, no padding — mirrors core generateToken(32). */
function guestToken(): string {
  return randomBytes(32).toString('base64url').replace(/=+$/, '');
}

// P3-T12: one ACTIVE event per format for manual QA and the GATE P3 tour.
// Full demo universe (vendors, venues, gallery, load data) lands with Backend.md §14.
// Idempotent: wipes the demo host's events, then recreates them from the live templates
// (checklist, budget split and programme match what the wizard applies — UF-03-3).

const DEMO_EMAIL = 'demo@tiwa.test';

interface SeedEvent {
  slug: string;
  type: string;
  name: string;
  daysOut: number;
  startHourWAT: number;
  expectedGuests: number;
  budgetMinor: bigint;
  visibility: 'PRIVATE' | 'LINK_ONLY' | 'PUBLIC';
}

const EVENTS: SeedEvent[] = [
  {
    slug: 'seed-birthday',
    type: 'birthday',
    name: "Ada's 40th Birthday",
    daysOut: 75,
    startHourWAT: 16,
    expectedGuests: 80,
    budgetMinor: 2_500_000_00n,
    visibility: 'PRIVATE',
  },
  {
    slug: 'seed-end-of-year',
    type: 'end_of_year_party',
    name: 'Tiwa End-of-Year Party',
    daysOut: 90,
    startHourWAT: 18,
    expectedGuests: 150,
    budgetMinor: 10_000_000_00n,
    visibility: 'PRIVATE',
  },
  {
    slug: 'seed-concert',
    type: 'concert',
    name: 'Lagos Live Concert',
    daysOut: 120,
    startHourWAT: 19,
    expectedGuests: 2000,
    budgetMinor: 25_000_000_00n,
    visibility: 'PUBLIC',
  },
  {
    slug: 'seed-church',
    type: 'church_programme',
    name: 'Harvest Thanksgiving Service',
    daysOut: 45,
    startHourWAT: 10,
    expectedGuests: 500,
    budgetMinor: 1_000_000_00n,
    visibility: 'LINK_ONLY',
  },
];

function atWAT(daysOut: number, hourWAT: number, now: Date): Date {
  const day = new Date(now.getTime() + daysOut * 24 * 60 * 60 * 1000);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hourWAT - 1, 0, 0));
}

async function wipeDemoEvents(userId: string) {
  const events = await prisma.event.findMany({ where: { createdById: userId }, select: { id: true } });
  const ids = events.map((event) => event.id);
  if (ids.length === 0) return;
  await prisma.task.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.programmeItem.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.eventDay.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.budgetCategory.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.inviteDelivery.deleteMany({ where: { guest: { eventId: { in: ids } } } });
  await prisma.inviteBatch.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.guest.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.guestGroup.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.seatingTable.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.document.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: { in: ids } } });
  // P5-T13: gallery universe (media, guestbook, sessions, zips + media outbox rows).
  const galleryIds = (await prisma.gallery.findMany({ where: { eventId: { in: ids } }, select: { id: true } })).map(
    (row) => row.id,
  );
  if (galleryIds.length > 0) {
    const mediaIds = (
      await prisma.mediaItem.findMany({ where: { galleryId: { in: galleryIds } }, select: { id: true } })
    ).map((row) => row.id);
    if (mediaIds.length > 0) {
      await prisma.report.deleteMany({ where: { targetId: { in: mediaIds } } });
      await prisma.outboxEvent.deleteMany({
        where: { OR: mediaIds.map((id) => ({ payload: { path: ['mediaItemId'], equals: id } })) },
      });
    }
    await prisma.mediaZip.deleteMany({ where: { galleryId: { in: galleryIds } } });
    await prisma.mediaItem.deleteMany({ where: { galleryId: { in: galleryIds } } });
    await prisma.guestbookMessage.deleteMany({ where: { galleryId: { in: galleryIds } } });
    await prisma.guestSession.deleteMany({ where: { galleryId: { in: galleryIds } } });
    await prisma.auditLog.deleteMany({ where: { targetId: { in: galleryIds } } });
    await prisma.gallery.deleteMany({ where: { id: { in: galleryIds } } });
  }
  await prisma.outboxEvent.deleteMany({
    where: { OR: ids.map((id) => ({ payload: { path: ['eventId'], equals: id } })) },
  });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: ids } } });
  await prisma.event.deleteMany({ where: { id: { in: ids } } });
}

async function seedEvent(userId: string, spec: SeedEvent, now: Date) {
  const template = getEventType(spec.type);
  if (!template) throw new Error(`unknown template in seed: ${spec.type}`);
  void EVENT_TYPES.length;

  const startsAt = atWAT(spec.daysOut, spec.startHourWAT, now);
  const endsAt = new Date(startsAt.getTime() + 5 * 60 * 60 * 1000);

  const event = await prisma.event.create({
    data: {
      slug: spec.slug,
      type: template.key,
      format: template.format,
      status: 'ACTIVE',
      name: spec.name,
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      startsAt,
      endsAt,
      expectedGuests: spec.expectedGuests,
      plannedBudgetMinor: spec.budgetMinor,
      visibility: spec.visibility,
      invitesEnabled: template.features.invites,
      momentsEnabled: template.features.moments,
      ticketsEnabled: template.features.tickets && spec.visibility === 'PUBLIC',
      createdById: userId,
    },
    select: { id: true },
  });

  await prisma.eventParticipant.create({
    data: { eventId: event.id, userId, role: 'HOST', acceptedAt: now },
  });

  const day = await prisma.eventDay.create({
    data: {
      eventId: event.id,
      date: new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate())),
      venueName: 'Venue not decided yet',
      sortOrder: 0,
    },
  });

  // Checklist with due dates like finalizeEvent's dueFor (past dues clamp to now).
  await prisma.task.createMany({
    data: template.checklist.map((item, index) => {
      const raw = new Date(startsAt.getTime() - TIMEFRAME_DAYS_BEFORE[item.timeframe] * 24 * 60 * 60 * 1000);
      const dueAt = raw < now && item.timeframe !== 'day' && item.timeframe !== 'after' ? now : raw;
      return {
        eventId: event.id,
        key: item.key,
        title: item.title,
        timeframe: item.timeframe,
        dueAt,
        priority: item.priority ?? 'NORMAL',
        sortOrder: index,
      };
    }),
  });

  // Budget split by template percentages (remainder to the last category).
  const percents = template.budget.map((split) => split.percent);
  const total = percents.reduce((sum, percent) => sum + percent, 0);
  let assigned = 0n;
  const planned = template.budget.map((split, index) => {
    if (index === template.budget.length - 1) return spec.budgetMinor - assigned;
    const share = (spec.budgetMinor * BigInt(split.percent)) / BigInt(total);
    assigned += share;
    return share;
  });
  await prisma.budgetCategory.createMany({
    data: template.budget.map((split, index) => ({
      eventId: event.id,
      key: split.key,
      label: split.label,
      plannedMinor: planned[index] ?? 0n,
      sortOrder: index,
    })),
  });

  await prisma.programmeItem.createMany({
    data: template.programme.map((item, index) => ({
      eventId: event.id,
      dayId: day.id,
      key: item.key,
      title: item.title,
      startsAt: item.offsetMinutes !== undefined ? new Date(startsAt.getTime() + item.offsetMinutes * 60_000) : null,
      endsAt:
        item.offsetMinutes !== undefined && item.durationMinutes
          ? new Date(startsAt.getTime() + (item.offsetMinutes + item.durationMinutes) * 60_000)
          : null,
      sortOrder: index,
    })),
  });

  return event.id;
}

/**
 * P4-T12: demo guest list on the birthday event — two groups, guests across
 * RSVP states (one with meal + plus-ones), a DONE invite batch with mixed
 * delivery statuses for the tracking table, and a checked-in guest.
 */
async function seedGuests(userId: string, eventId: string, now: Date) {
  const family = await prisma.guestGroup.create({ data: { eventId, name: 'Family', color: '#b83a17' } });
  const friends = await prisma.guestGroup.create({ data: { eventId, name: 'Friends', color: '#2563eb' } });
  const t1 = await prisma.seatingTable.create({ data: { eventId, name: 'Head Table', capacity: 8 } });

  const rows = [
    {
      name: 'Adaeze Okafor',
      phone: '+2348031234567',
      email: 'ada@example.com',
      groupIds: [family.id],
      rsvp: 'YES',
      respondedAt: now,
      plusOnes: 1,
      meal: 'Jollof',
      dietary: 'No nuts',
      tableId: t1.id,
    },
    {
      name: 'Emeka Obi',
      phone: '+2348039876543',
      email: null,
      groupIds: [family.id],
      rsvp: 'YES',
      respondedAt: now,
      plusOnes: 0,
      meal: null,
      dietary: null,
      tableId: t1.id,
    },
    {
      name: 'Funmi Ade',
      phone: null,
      email: 'funmi@example.com',
      groupIds: [friends.id],
      rsvp: 'MAYBE',
      respondedAt: now,
      plusOnes: 0,
      meal: null,
      dietary: null,
      tableId: null,
    },
    {
      name: 'Tunde Bakare',
      phone: '+2348055551111',
      email: null,
      groupIds: [],
      rsvp: 'NO',
      respondedAt: now,
      plusOnes: 0,
      meal: null,
      dietary: null,
      tableId: null,
    },
    {
      name: 'Walk-in Wale',
      phone: '+2348077772222',
      email: null,
      groupIds: [],
      rsvp: 'NONE',
      respondedAt: null,
      plusOnes: 0,
      meal: null,
      dietary: null,
      tableId: null,
    },
    {
      name: 'Checked-in Chi',
      phone: null,
      email: 'chi@example.com',
      groupIds: [friends.id],
      rsvp: 'YES',
      respondedAt: now,
      plusOnes: 0,
      meal: null,
      dietary: null,
      tableId: null,
      checkedInAt: now,
    },
  ] as const;
  const guests = await Promise.all(
    rows.map((row) =>
      prisma.guest.create({
        data: {
          eventId,
          name: row.name,
          phone: row.phone,
          email: row.email,
          groupIds: [...row.groupIds],
          rsvp: row.rsvp as 'YES' | 'NO' | 'MAYBE' | 'NONE',
          respondedAt: row.respondedAt,
          plusOnes: row.plusOnes,
          meal: row.meal,
          dietary: row.dietary,
          tableId: row.tableId,
          source: 'MANUAL',
          inviteToken: guestToken(),
          checkedInAt: 'checkedInAt' in row ? (row.checkedInAt as Date) : null,
        },
        select: { id: true, name: true, phone: true, email: true },
      }),
    ),
  );

  const batch = await prisma.inviteBatch.create({
    data: {
      eventId,
      createdById: userId,
      channels: ['WHATSAPP', 'EMAIL', 'SMS'],
      smart: true,
      message: 'You are invited! Tap your link to reply: {link}',
      kind: 'INVITE',
      audience: { type: 'all' },
      status: 'DONE',
      sentAt: now,
    },
    select: { id: true },
  });
  const byName = new Map(guests.map((guest) => [guest.name, guest]));
  const statuses = [
    { name: 'Adaeze Okafor', channel: 'WHATSAPP' as const, status: 'DELIVERED' as const },
    { name: 'Emeka Obi', channel: 'WHATSAPP' as const, status: 'SENT' as const },
    { name: 'Funmi Ade', channel: 'EMAIL' as const, status: 'OPENED' as const },
    { name: 'Tunde Bakare', channel: 'SMS' as const, status: 'SENT' as const },
  ];
  await prisma.inviteDelivery.createMany({
    data: statuses.map((row) => ({
      guestId: byName.get(row.name)?.id as string,
      batchId: batch.id,
      channel: row.channel,
      status: row.status,
    })),
  });
}

// ───────────── P6-T19: guest-enquiry fixture (UF-31) ─────────────
// Fixed values the e2e spec uses: the guest signs in with this phone and opens
// this invite's pass page after the event, where [Message] appears for the venue.
export const ENQUIRY_GUEST_PHONE = '+2348030009999';
export const ENQUIRY_INVITE_TOKEN = 'seed-enquiry-invite-token-0001';

async function seedChatEnquiry(demoUserId: string, now: Date) {
  const venue = await prisma.organization.findUnique({ where: { slug: 'seed-venue-e2e' }, select: { id: true } });
  if (!venue) return;
  // Threads from earlier runs point at deleted events; drop them so reuse checks start clean.
  await prisma.thread.deleteMany({ where: { context: 'GUEST_ENQUIRY', participants: { some: { orgId: venue.id } } } });
  const startsAt = new Date(now.getTime() - 10 * 86_400_000);
  const event = await prisma.event.create({
    data: {
      slug: 'seed-ended-enquiry',
      type: 'birthday',
      format: 'PRIVATE_CELEBRATION',
      status: 'ACTIVE',
      name: "Tolu's 30th",
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 5 * 3_600_000),
      invitesEnabled: true,
      createdById: demoUserId,
      participants: {
        create: [
          { userId: demoUserId, role: 'HOST', acceptedAt: now },
          { orgId: venue.id, role: 'VENDOR', acceptedAt: now },
        ],
      },
    },
    select: { id: true },
  });
  await prisma.guest.create({
    data: {
      eventId: event.id,
      name: 'Enquiry Guest',
      phone: ENQUIRY_GUEST_PHONE,
      rsvp: 'YES',
      respondedAt: startsAt,
      inviteToken: ENQUIRY_INVITE_TOKEN,
    },
  });
}

async function main() {
  const now = new Date();
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: 'Demo Host', countryCode: 'NG' },
    create: { email: DEMO_EMAIL, name: 'Demo Host', countryCode: 'NG', emailVerified: true },
    select: { id: true },
  });

  await wipeDemoEvents(user.id);
  const ids: string[] = [];
  for (const spec of EVENTS) ids.push(await seedEvent(user.id, spec, now));
  // P4-T12: guests + a sent batch on the birthday event for the e2e/GATE tour.
  await seedGuests(user.id, ids[0] as string, now);
  // P5-T13: gallery media (200 photos + 10 videos), guestbook, load set, e2e host.
  await seedGalleryMedia(user.id, ids[0] as string, ids[2] as string, now);
  // P6-T10: marketplace (40 vendors, 8 venues with spaces, 5 planners) + e2e owners.
  await seedMarketplace();
  // P6-T19: an ended event the e2e venue worked on, with a guest who said yes (UF-31).
  await seedChatEnquiry(user.id, now);
  console.log(`[seed] demo host ${DEMO_EMAIL} + ${ids.length} events (birthday, end-of-year, concert, church).`);
}

// ───────────── P5-T13: gallery media seeding ─────────────
// Fixed codes keep e2e deterministic (MOMSDEMO: moments demo gallery,
// LOAD5000: 5 000-row virtualisation set). Photos are generated locally with
// a hand-rolled PNG writer (no native deps); videos use ffmpeg when present.

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Solid-hue PNG with a soft vertical gradient (compresses to tens of KB). */
function solidPng(width: number, height: number, hue: number): Uint8Array {
  const [r, g, b] = hsl(hue % 360, 0.55, 0.55);
  const stride = width * 3 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const t = 0.65 + (0.35 * y) / height;
    raw[y * stride] = 0;
    for (let x = 0; x < width; x += 1) {
      const wobble = (x * 7 + y * 13) % 11;
      raw[y * stride + 1 + x * 3] = Math.min(255, Math.round(r * t) + wobble);
      raw[y * stride + 1 + x * 3 + 1] = Math.min(255, Math.round(g * t) + wobble);
      raw[y * stride + 1 + x * 3 + 2] = Math.min(255, Math.round(b * t) + wobble);
    }
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const parts = [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  return Buffer.concat(parts);
}

function blurPlaceholder(): string {
  const tiny = solidPng(16, 12, 210);
  return `data:image/png;base64,${Buffer.from(tiny).toString('base64')}`;
}

async function seedGalleryMedia(demoUserId: string, birthdayId: string, concertId: string, now: Date) {
  void concertId;
  void demoUserId;
  void now;

  // Birthday gallery: approve-first demo wall with a fixed code for e2e.
  // Object bytes come from `pnpm seed:gallery` (worker package, needs S3Mock
  // + ffmpeg); rows land here so the gallery works even without them.
  const gallery = await prisma.gallery.create({
    data: { eventId: birthdayId, code: 'MOMSDEMO', accessCode: 'KX4Q2M', moderation: 'APPROVE_FIRST' },
    select: { id: true },
  });

  const photoRows: {
    galleryId: string;
    album: 'GUEST' | 'OFFICIAL';
    kind: 'PHOTO';
    state: 'PUBLISHED';
    originalKey: string;
    thumbKey: string;
    largeKey: string;
    blurDataUrl: string;
    width: number;
    height: number;
    sizeBytes: number;
  }[] = [];
  for (let i = 0; i < 200; i += 1) {
    const hue = Math.round((i * 137.5) % 360);
    const original = solidPng(640, 480, hue);
    const album = i < 10 ? 'OFFICIAL' : 'GUEST';
    const base = `g/${gallery.id}/seed/${i}`;
    photoRows.push({
      galleryId: gallery.id,
      album,
      kind: 'PHOTO',
      state: 'PUBLISHED',
      originalKey: `${base}/o.png`,
      thumbKey: `${base}/t.png`,
      largeKey: `${base}/l.png`,
      blurDataUrl: blurPlaceholder(),
      width: 960,
      height: 720,
      sizeBytes: original.length,
    });
  }
  // Five pending rows keep the review queue (and e2e approve flow) non-empty.
  const pendingRows = Array.from({ length: 5 }, (_, i) => ({
    galleryId: gallery.id,
    album: 'GUEST' as const,
    kind: 'PHOTO' as const,
    state: 'PENDING_REVIEW' as const,
    originalKey: `g/${gallery.id}/seed/p${i}.png`,
    thumbKey: `g/${gallery.id}/seed/pt${i}.png`,
    largeKey: `g/${gallery.id}/seed/pl${i}.png`,
    blurDataUrl: blurPlaceholder(),
    width: 640,
    height: 480,
    sizeBytes: 1000 + i,
  }));
  await prisma.mediaItem.createMany({ data: [...photoRows, ...pendingRows] });

  // Ten video rows (bytes come from `pnpm seed:gallery`).
  await prisma.mediaItem.createMany({
    data: Array.from({ length: 10 }, (_, i) => ({
      galleryId: gallery.id,
      album: 'GUEST' as const,
      kind: 'VIDEO' as const,
      state: 'PUBLISHED' as const,
      originalKey: `g/${gallery.id}/seed/v${i}.mp4`,
      sizeBytes: 7000 + i,
      durationSec: 2,
    })),
  });

  // Guestbook samples on the demo wall.
  await prisma.guestbookMessage.createMany({
    data: [
      { galleryId: gallery.id, name: 'Adaeze', body: 'What a night! The food, the music — perfect.' },
      { galleryId: gallery.id, name: 'Emeka', body: 'Happy 40th! More life, more blessings.' },
      { galleryId: gallery.id, name: null, body: 'Danced till my shoes gave up. 10/10.' },
    ],
  });

  // E2E hosts: deterministic phone logins as HOST of the birthday event.
  // phoneNumber mirrors phone: better-auth's phone plugin keys users off
  // phoneNumber, so the seed must set both or OTP verify creates a dupe.
  // Three numbers share the OTP rate budget across parallel spec files.
  // Remove any dupe rows a previous broken run left behind first.
  const e2ePhones = ['+2348099999991', '+2348099999992', '+2348099999993'];
  const dupes = await prisma.user.findMany({
    where: {
      OR: e2ePhones.flatMap((phone) => [{ phone }, { phoneNumber: phone }]),
      NOT: { email: { startsWith: 'e2e-host-' } },
    },
    select: { id: true },
  });
  if (dupes.length > 0) {
    const dupeIds = dupes.map((u) => u.id);
    await prisma.eventParticipant.deleteMany({ where: { userId: { in: dupeIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: dupeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: dupeIds } } });
  }
  for (const [index, phone] of e2ePhones.entries()) {
    const e2eHost = await prisma.user.upsert({
      where: { email: `e2e-host-${index + 1}@tiwa.test` },
      update: {
        name: `E2E Host ${index + 1}`,
        phone,
        phoneVerified: true,
        phoneNumber: phone,
        phoneNumberVerified: true,
        countryCode: 'NG',
      },
      create: {
        email: `e2e-host-${index + 1}@tiwa.test`,
        name: `E2E Host ${index + 1}`,
        phone,
        phoneVerified: true,
        phoneNumber: phone,
        phoneNumberVerified: true,
        countryCode: 'NG',
        emailVerified: true,
      },
      select: { id: true },
    });
    const existingMember = await prisma.eventParticipant.findFirst({
      where: { eventId: birthdayId, userId: e2eHost.id, removedAt: null },
    });
    if (!existingMember) {
      await prisma.eventParticipant.create({
        data: { eventId: birthdayId, userId: e2eHost.id, role: 'HOST', acceptedAt: now },
      });
    }
  }

  // LOAD5000: 5 000-row virtualisation set on the end-of-year gallery (no files — tiles render placeholders).
  const eoy = await prisma.event.findFirstOrThrow({
    where: { createdById: demoUserId, type: 'end_of_year_party' },
    select: { id: true },
  });
  const load = await prisma.gallery.create({
    data: { eventId: eoy.id, code: 'LOAD5000', accessCode: 'LD5000X' },
    select: { id: true },
  });
  const bulk = Array.from({ length: 5000 }, (_, i) => ({
    galleryId: load.id,
    album: 'GUEST' as const,
    kind: 'PHOTO' as const,
    state: 'PUBLISHED' as const,
    originalKey: `g/${load.id}/bulk/${i}.jpg`,
    sizeBytes: 1000 + (i % 9000),
  }));
  for (let batch = 0; batch < bulk.length; batch += 1000) {
    await prisma.mediaItem.createMany({ data: bulk.slice(batch, batch + 1000) });
  }
  console.log('[seed] gallery media: 200 photos + clips + guestbook on MOMSDEMO, 5000-row LOAD5000 set.');
}

// ───────────── P6-T10: marketplace seeding ─────────────
// 40 vendors (one partial + e2e-owned), 8 venues with spaces (one e2e-owned),
// 5 planners. Idempotent: wipes the seed slugs first. Portfolio bytes are
// generated locally and PUT to the private bucket so public pages render.

const SEED_CATEGORIES: { key: string; label: string; cities: string[]; baseMinor: bigint }[] = [
  { key: 'catering', label: 'Catering', cities: ['Lagos', 'Lagos', 'Abuja'], baseMinor: 1_500_000_00n },
  { key: 'photography', label: 'Photography', cities: ['Lagos', 'Lagos', 'Ibadan'], baseMinor: 350_000_00n },
  { key: 'decor', label: 'Decor and styling', cities: ['Lagos', 'Port Harcourt', 'Lagos'], baseMinor: 800_000_00n },
  { key: 'dj', label: 'DJ', cities: ['Lagos', 'Abuja', 'Lagos'], baseMinor: 250_000_00n },
  { key: 'mc', label: 'MC or host', cities: ['Lagos', 'Lagos'], baseMinor: 150_000_00n },
  { key: 'cake', label: 'Cake and desserts', cities: ['Lagos', 'Ibadan', 'Lagos'], baseMinor: 120_000_00n },
  { key: 'makeup', label: 'Makeup and hair', cities: ['Lagos', 'Lagos'], baseMinor: 80_000_00n },
  { key: 'videography', label: 'Videography', cities: ['Lagos', 'Abuja'], baseMinor: 400_000_00n },
  { key: 'live_band', label: 'Live band', cities: ['Lagos'], baseMinor: 600_000_00n },
  { key: 'small_chops', label: 'Small chops', cities: ['Lagos', 'Lagos'], baseMinor: 90_000_00n },
  { key: 'drinks', label: 'Drinks and bar', cities: ['Lagos'], baseMinor: 200_000_00n },
  { key: 'sound_lighting', label: 'Sound and lighting', cities: ['Lagos', 'Abuja'], baseMinor: 300_000_00n },
  { key: 'rentals', label: 'Chairs, tables and tents', cities: ['Lagos'], baseMinor: 150_000_00n },
  { key: 'transport', label: 'Transport', cities: ['Lagos'], baseMinor: 100_000_00n },
  { key: 'ushers', label: 'Ushers and hostesses', cities: ['Lagos', 'Abuja'], baseMinor: 60_000_00n },
  { key: 'security', label: 'Security', cities: ['Lagos', 'Lagos'], baseMinor: 70_000_00n },
  { key: 'printing', label: 'Printing and stationery', cities: ['Lagos'], baseMinor: 50_000_00n },
  { key: 'souvenirs', label: 'Souvenirs and gifts', cities: ['Lagos', 'Ibadan'], baseMinor: 65_000_00n },
  { key: 'entertainment', label: 'Kids entertainment', cities: ['Lagos'], baseMinor: 110_000_00n },
  { key: 'cleaning', label: 'Cleaning', cities: ['Lagos'], baseMinor: 45_000_00n },
  { key: 'fashion', label: 'Outfits and tailoring', cities: ['Lagos'], baseMinor: 130_000_00n },
];

const SEED_VENUES: {
  slug: string;
  name: string;
  city: string;
  spaces: { name: string; seated: number; price: string }[];
}[] = [
  {
    slug: 'seed-venue-e2e',
    name: 'E2E Grand Hall',
    city: 'Lagos',
    spaces: [
      { name: 'Grand Hall', seated: 500, price: '500000000' },
      { name: 'Garden', seated: 100, price: '150000000' },
    ],
  },
  {
    slug: 'seed-venue-02',
    name: 'Lekki Palms Centre',
    city: 'Lagos',
    spaces: [{ name: 'Main Hall', seated: 800, price: '900000000' }],
  },
  {
    slug: 'seed-venue-03',
    name: 'Ikeja Conference Suites',
    city: 'Lagos',
    spaces: [
      { name: 'Conference A', seated: 120, price: '80000000' },
      { name: 'Boardroom', seated: 25, price: '25000000' },
    ],
  },
  {
    slug: 'seed-venue-04',
    name: 'Abuja Unity Hall',
    city: 'Abuja',
    spaces: [{ name: 'Unity Hall', seated: 600, price: '700000000' }],
  },
  {
    slug: 'seed-venue-05',
    name: 'PH Riverside Gardens',
    city: 'Port Harcourt',
    spaces: [{ name: 'Riverside', seated: 250, price: '300000000' }],
  },
  {
    slug: 'seed-venue-06',
    name: 'Ibadan Heritage House',
    city: 'Ibadan',
    spaces: [{ name: 'Heritage Hall', seated: 180, price: '180000000' }],
  },
  {
    slug: 'seed-venue-07',
    name: 'Victoria Island Rooftop',
    city: 'Lagos',
    spaces: [{ name: 'Rooftop', seated: 90, price: '220000000' }],
  },
  {
    slug: 'seed-venue-08',
    name: 'Surulere Community Hall',
    city: 'Lagos',
    spaces: [{ name: 'Community Hall', seated: 350, price: '120000000' }],
  },
];

async function wipeMarketplace() {
  const orgs = await prisma.organization.findMany({
    where: {
      OR: [
        { slug: { startsWith: 'seed-vendor' } },
        { slug: { startsWith: 'seed-venue' } },
        { slug: { startsWith: 'seed-planner' } },
      ],
    },
    select: { id: true },
  });
  const orgIds = orgs.map((row) => row.id);
  if (orgIds.length > 0) {
    await prisma.shortlist.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.availabilityBlock.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.venueSpace.deleteMany({ where: { profile: { orgId: { in: orgIds } } } });
    await prisma.servicePackage.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.portfolioItem.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.businessProfile.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.businessVerification.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.membership.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: ['vendor-e2e@tiwa.test', 'venue-e2e@tiwa.test'] } } });
}

async function seedMarketplace() {
  await wipeMarketplace();
  const { S3Storage } = await import('@tiwa/storage');
  const { loadEnv } = await import('@tiwa/config');
  const seedEnv = loadEnv();
  const storage = new S3Storage({
    endpoint: seedEnv.S3_ENDPOINT,
    region: seedEnv.S3_REGION,
    bucket: seedEnv.S3_BUCKET_PRIVATE,
    accessKeyId: seedEnv.S3_ACCESS_KEY_ID,
    secretAccessKey: seedEnv.S3_SECRET_ACCESS_KEY,
  });

  let photoHue = 0;
  async function portfolioFor(orgId: string, count: number) {
    const rows: { orgId: string; kind: 'PHOTO'; key: string; sortOrder: number }[] = [];
    for (let i = 0; i < count; i += 1) {
      const key = `business/${orgId}/portfolio/seed-${i}`;
      await storage.put(key, Buffer.from(solidPng(320, 240, photoHue)), 'image/png');
      photoHue = (photoHue + 47) % 360;
      rows.push({ orgId, kind: 'PHOTO', key, sortOrder: i });
    }
    await prisma.portfolioItem.createMany({ data: rows });
  }

  // 40 vendors; seed-vendor-e2e stays partial (no portfolio/packages, unpublished) for the UF-13 tour.
  let vendorIndex = 0;
  for (const category of SEED_CATEGORIES) {
    for (let copy = 0; copy < category.cities.length && vendorIndex < 39; copy += 1) {
      vendorIndex += 1;
      const slug = `seed-vendor-${String(vendorIndex).padStart(2, '0')}`;
      const city = category.cities[copy] as string;
      const name = `${category.label} ${city} ${vendorIndex}`;
      const org = await prisma.organization.create({
        data: {
          kind: 'VENDOR',
          name,
          slug,
          countryCode: 'NG',
          city,
          verification: vendorIndex % 3 === 0 ? 'APPROVED' : 'NONE',
        },
      });
      const price = category.baseMinor + BigInt(vendorIndex * 1_000_00);
      const rated = vendorIndex % 2 === 0;
      await prisma.businessProfile.create({
        data: {
          orgId: org.id,
          categories: [category.key],
          bio: `${name} — trusted ${category.label.toLowerCase()} in ${city}.`,
          city,
          currency: 'NGN',
          startingPriceMinor: price,
          published: true,
          ratingAvg: rated ? 4 + (vendorIndex % 10) / 10 : null,
          ratingCount: rated ? 6 + vendorIndex : 0,
          completedBookings: rated ? vendorIndex : 0,
          searchText: `${name} ${city} ${category.label} ${category.key}`,
        },
      });
      await prisma.servicePackage.create({
        data: {
          orgId: org.id,
          name: 'Standard',
          currency: 'NGN',
          priceMinor: price,
          includes: ['Consultation', 'Event day service'],
          addOns: [],
        },
      });
      await portfolioFor(org.id, 6);
    }
  }
  // Partial vendor + e2e owner for the UF-13 tour.
  const e2eVendor = await prisma.organization.create({
    data: { kind: 'VENDOR', name: 'E2E Vendor', slug: 'seed-vendor-e2e', countryCode: 'NG', city: 'Lagos' },
  });
  const vendorUser = await prisma.user.create({
    data: { email: 'vendor-e2e@tiwa.test', name: 'E2E Vendor', countryCode: 'NG', emailVerified: true },
  });
  await prisma.membership.create({ data: { orgId: e2eVendor.id, userId: vendorUser.id, role: 'OWNER' } });
  await prisma.businessProfile.create({
    data: {
      orgId: e2eVendor.id,
      categories: ['catering'],
      bio: 'E2E catering.',
      city: 'Lagos',
      currency: 'NGN',
      published: false,
      searchText: 'E2E Vendor Lagos catering',
    },
  });

  // 8 venues with spaces + e2e owner on the first.
  const venueUser = await prisma.user.create({
    data: { email: 'venue-e2e@tiwa.test', name: 'E2E Venue', countryCode: 'NG', emailVerified: true },
  });
  for (const venue of SEED_VENUES) {
    const org = await prisma.organization.create({
      data: {
        kind: 'VENDOR',
        name: venue.name,
        slug: venue.slug,
        countryCode: 'NG',
        city: venue.city,
        verification: 'APPROVED',
      },
    });
    if (venue.slug === 'seed-venue-e2e') {
      await prisma.membership.create({ data: { orgId: org.id, userId: venueUser.id, role: 'OWNER' } });
    }
    const profile = await prisma.businessProfile.create({
      data: {
        orgId: org.id,
        categories: ['venue', 'catering'],
        bio: `${venue.name} — events in ${venue.city}.`,
        city: venue.city,
        currency: 'NGN',
        published: true,
        ratingAvg: 4.6,
        ratingCount: 12,
        completedBookings: 30,
        searchText: `${venue.name} ${venue.city} venue hall`,
      },
    });
    for (const space of venue.spaces) {
      await prisma.venueSpace.create({
        data: {
          profileId: profile.id,
          name: space.name,
          indoor: true,
          capacitySeated: space.seated,
          capacityStanding: Math.round(space.seated * 1.5),
          amenities: ['parking', 'power_backup'],
          slotPrices: { EVENING: space.price },
          securityDepositMinor: 1_000_000_00n,
        },
      });
    }
    await prisma.servicePackage.create({
      data: {
        orgId: org.id,
        name: 'Hall hire',
        currency: 'NGN',
        priceMinor: BigInt(venue.spaces[0]?.price ?? '100000000'),
        includes: ['Setup', 'Security'],
        addOns: [],
      },
    });
    await portfolioFor(org.id, 6);
  }

  // 5 planners for /planners search.
  for (let i = 1; i <= 5; i += 1) {
    const slug = `seed-planner-0${i}`;
    const org = await prisma.organization.create({
      data: {
        kind: 'PLANNER',
        name: `Seed Planner ${i}`,
        slug,
        countryCode: 'NG',
        city: i % 2 === 0 ? 'Abuja' : 'Lagos',
      },
    });
    await prisma.businessProfile.create({
      data: {
        orgId: org.id,
        categories: ['decor', 'mc'],
        bio: `Seed Planner ${i} — full coordination.`,
        city: i % 2 === 0 ? 'Abuja' : 'Lagos',
        currency: 'NGN',
        published: true,
        searchText: `Seed Planner ${i} coordination`,
      },
    });
    await portfolioFor(org.id, 6);
  }
  console.log('[seed] marketplace: 40 vendors, 8 venues with spaces, 5 planners.');
}

await main()
  .catch((error: unknown) => {
    console.error('[seed] failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
