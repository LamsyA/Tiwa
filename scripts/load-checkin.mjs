// P11-T10 / GATE P11 load: 300 scans/min across 6 devices, result ≤ 300 ms
// p95 (UF-23-3). Seeds its own host + event + 300 paid tickets (unique run
// prefix, idempotent cleanup first), then fires 300 `checkIn` calls in one
// minute-shaped burst across 6 device ids through the built core package and
// reports p50/p95/p99. Run with the dev DB up:
//
//   node --env-file=.env scripts/load-checkin.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireDb = createRequire(path.join(root, 'packages/db/package.json'));
const requireCore = createRequire(path.join(root, 'packages/core/package.json'));
const { PrismaClient } = requireDb('@prisma/client');
const core = requireCore('@tiwa/core');

const SECRET = process.env.AUTH_SECRET ?? 'dev-only-secret-change-me-in-production-000000';
const PREFIX = 'load-checkin-';
const TICKETS = 300;
const DEVICES = 6;

const prisma = new PrismaClient();

function uuid() {
  return core.uuidv7();
}

async function setup() {
  await prisma.checkIn.deleteMany({ where: { event: { slug: { startsWith: PREFIX } } } }).catch(() => undefined);
  await prisma.ticket.deleteMany({ where: { event: { slug: { startsWith: PREFIX } } } }).catch(() => undefined);
  await prisma.ticketOrder.deleteMany({ where: { event: { slug: { startsWith: PREFIX } } } }).catch(() => undefined);
  await prisma.ticketType.deleteMany({ where: { event: { slug: { startsWith: PREFIX } } } }).catch(() => undefined);
  await prisma.eventParticipant
    .deleteMany({ where: { event: { slug: { startsWith: PREFIX } } } })
    .catch(() => undefined);
  await prisma.event.deleteMany({ where: { slug: { startsWith: PREFIX } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }).catch(() => undefined);

  const slug = `${PREFIX}${Date.now().toString(36)}`;
  const user = await prisma.user.create({
    data: { name: 'Load Checkin', email: `${PREFIX}${Date.now()}@tiwa.test`, countryCode: 'NG' },
  });
  const event = await prisma.event.create({
    data: {
      id: uuid(),
      slug,
      type: 'conference',
      format: 'PUBLIC_TICKETED',
      status: 'ACTIVE',
      name: 'Load Checkin Event',
      visibility: 'PUBLIC',
      countryCode: 'NG',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      ticketsEnabled: true,
      ticketsPublished: true,
      createdById: user.id,
      participants: { create: { id: uuid(), userId: user.id, role: 'HOST', acceptedAt: new Date() } },
    },
  });
  const type = await prisma.ticketType.create({
    data: {
      id: uuid(),
      eventId: event.id,
      name: 'General',
      priceMinor: 0n,
      currency: 'NGN',
      quantity: TICKETS + 10,
      maxPerOrder: 10,
      sortOrder: 0,
    },
  });
  const order = await prisma.ticketOrder.create({
    data: {
      id: uuid(),
      eventId: event.id,
      buyerName: 'Load Buyer',
      buyerEmail: `${PREFIX}@tiwa.test`,
      items: [{ ticketTypeId: type.id, qty: TICKETS, unitMinor: '0' }],
      subtotalMinor: 0n,
      discountMinor: 0n,
      feeMinor: 0n,
      totalMinor: 0n,
      currency: 'NGN',
      status: 'PAID',
      reservedUntil: new Date(),
      answers: {},
    },
  });
  const tickets = [];
  for (let i = 0; i < TICKETS; i++) {
    const id = uuid();
    tickets.push({
      id,
      orderId: order.id,
      ticketTypeId: type.id,
      eventId: event.id,
      holderName: `Load Holder ${i}`,
      qrToken: core.ticketQrValue(id, event.id, SECRET),
    });
  }
  // Batched inserts keep the setup fast.
  for (let i = 0; i < tickets.length; i += 100) {
    await prisma.ticket.createMany({ data: tickets.slice(i, i + 100) });
  }
  await prisma.ticketType.update({ where: { id: type.id }, data: { sold: TICKETS } });
  return { user, event, tickets };
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  const { user, event, tickets } = await setup();
  const actor = { kind: 'user', userId: user.id, isAdmin: false };
  // Warm up (connection + query plans) before measuring.
  await core.checkIn(actor, { eventId: event.id, qrValue: tickets[0].qrToken, deviceId: 'warmup' }, SECRET);
  await prisma.ticket.update({ where: { id: tickets[0].id }, data: { checkedInAt: null } });
  await prisma.checkIn.deleteMany({ where: { eventId: event.id } });
  const durations = [];
  const results = { OK: 0, DUPLICATE: 0, INVALID: 0 };
  // UF-23-3 pace: 300 scans/min across 6 devices → 6 parallel scans/round, 50 rounds.
  const ROUNDS = 50;
  const started = Date.now();
  for (let round = 0; round < ROUNDS; round++) {
    const batch = tickets.slice(round * DEVICES, (round + 1) * DEVICES);
    await Promise.all(
      batch.map((ticket, index) =>
        (async () => {
          const begin = Date.now();
          const outcome = await core.checkIn(
            actor,
            { eventId: event.id, qrValue: ticket.qrToken, deviceId: `load-door-${index}` },
            SECRET,
          );
          durations.push(Date.now() - begin);
          results[outcome.result] = (results[outcome.result] ?? 0) + 1;
        })(),
      ),
    );
  }
  const elapsed = Date.now() - started;
  durations.sort((a, b) => a - b);
  console.log(
    `scans: ${tickets.length} across ${DEVICES} devices in ${elapsed} ms (${(tickets.length / (elapsed / 1000)).toFixed(1)}/s)`,
  );
  console.log(`results: OK=${results.OK} DUPLICATE=${results.DUPLICATE ?? 0} INVALID=${results.INVALID ?? 0}`);
  console.log(
    `p50=${percentile(durations, 50)} ms p95=${percentile(durations, 95)} ms p99=${percentile(durations, 99)} ms`,
  );
  const p95 = percentile(durations, 95);
  if (results.OK !== TICKETS || p95 > 300) {
    console.error(`GATE FAIL: expected ${TICKETS} OK with p95 ≤ 300 ms`);
    process.exitCode = 1;
  } else {
    console.log('GATE PASS: 300 scans, p95 ≤ 300 ms');
  }
  await prisma.$disconnect();
}

await main();
