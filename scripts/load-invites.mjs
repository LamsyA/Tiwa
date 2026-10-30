// P4-T12 load test: N invite sends through the REAL pipeline with Fake
// providers — core addGuests + createInviteBatch + sendInviteBatch, then the
// worker's fan-out (handleInviteBatchQueued) and per-delivery sends
// (handleSendInvite) with per-provider Redis rate limiting, exactly as
// production runs it. GATE P4: 2,000 invites in < 5 min.
//
// Usage: pnpm load:invites [--guests 2000]
// Requires: Postgres + Redis running (pnpm db:up) and a normal `pnpm build`.
// Run with: ./node_modules/.bin/tsx scripts/load-invites.mjs
import { setTimeout as sleep } from 'node:timers/promises';

process.loadEnvFile(new URL('../.env', import.meta.url));

const GUESTS = Number(process.argv.find((arg) => arg.startsWith('--guests='))?.split('=')[1] ?? 2000);
const BUDGET_MIN = 5 * 60 * 1000;
const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;

const { prisma } = await import('@tiwa/db');
const core = await import('@tiwa/core');
const { handleInviteBatchQueued } = await import('../apps/worker/src/jobs/send-invite.js');
const { handleSendInvite } = await import('../apps/worker/src/jobs/send-invite.js');
const { setProvidersForTests } = await import('../apps/worker/src/jobs/providers.js');
const { FakeEmail, FakeSms, FakeWhatsApp } = await import('@tiwa/messaging');

setProvidersForTests({ email: new FakeEmail(), sms: new FakeSms(), whatsapp: new FakeWhatsApp() });
const log = { info: () => undefined, error: () => undefined };

const slug = `load-${Date.now()}`;
console.log(`[load] creating host + event (${GUESTS} guests)…`);
const host = await prisma.user.create({ data: { name: 'Load Host', countryCode: 'NG' } });
const hostActor = { kind: 'user', userId: host.id, isAdmin: false };
const event = await prisma.event.create({
  data: {
    slug,
    type: 'concert',
    format: 'PUBLIC_TICKETED',
    status: 'ACTIVE',
    name: 'Load Test Concert',
    countryCode: 'NG',
    currency: 'NGN',
    timezone: 'Africa/Lagos',
    startsAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    invitesEnabled: true,
    createdById: host.id,
  },
  select: { id: true },
});
await prisma.eventParticipant.create({ data: { eventId: event.id, userId: host.id, role: 'HOST', acceptedAt: new Date() } });

// Guest creation, chunked like the UI limit (500/call).
let created = 0;
{
  const t0 = Date.now();
  for (let offset = 0; offset < GUESTS; offset += 500) {
    const count = Math.min(500, GUESTS - offset);
    const guests = Array.from({ length: count }, (_, i) => {
      const n = offset + i;
      return { name: `Load Guest ${n}`, phone: `+234803${String(2000000 + n).padStart(7, '0')}`, groupIds: [] };
    });
    const result = await core.addGuests(hostActor, { eventId: event.id, guests, source: 'CSV' });
    created += result.created.length;
  }
  console.log(`[load] ${created} guests created in ${((Date.now() - t0) / 1000).toFixed(1)}s (${elapsed()} total)`);
}

// One SMS batch for everybody (slowest provider limiter: 20/s — the worst case).
let batchId = '';
{
  const t0 = Date.now();
  const preview = await core.createInviteBatch(hostActor, {
    eventId: event.id,
    audience: { type: 'all' },
    channels: ['SMS'],
    smart: true,
    message: 'Load test invite {name} {link}',
    kind: 'INVITE',
  });
  console.log(`[load] batch composed: ${preview.total} deliveries in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const sent = await core.sendInviteBatch(hostActor, { batchId: preview.batchId, idempotencyKey: `load-${Date.now()}` });
  batchId = sent.batchId;
  console.log(`[load] batch queued: ${sent.queued} (${elapsed()} total)`);
}

// Fan-out through the real worker handler with a collecting (deduplicating) sink.
const jobs = [];
const sink = {
  async add(name, data, opts) {
    if (!jobs.some((job) => job.jobId === opts.jobId)) jobs.push({ name, data, jobId: opts.jobId });
  },
};
{
  const t0 = Date.now();
  const result = await handleInviteBatchQueued({ batchId }, log, sink);
  console.log(`[load] fan-out: ${result.enqueued} send jobs, ${jobs.length} unique (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

// Sends with worker-like concurrency (20, matching the worker).
{
  const t0 = Date.now();
  const CONCURRENCY = 20;
  let done = 0;
  let failed = 0;
  const queue = [...jobs];
  async function worker() {
    while (queue.length > 0) {
      const job = queue.pop();
      if (!job) break;
      try {
        const result = await handleSendInvite(job.data, log);
        if (result.status === 'SENT') done += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
      if ((done + failed) % 500 === 0) console.log(`[load] …${done + failed}/${jobs.length} sends (${elapsed()} total)`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`[load] sends: ${done} ok, ${failed} failed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (failed > 0) throw new Error(`${failed} sends failed`);
}

// Verify end state.
const [delivered, batch] = await Promise.all([
  prisma.inviteDelivery.count({ where: { batchId, status: 'SENT' } }),
  prisma.inviteBatch.findUniqueOrThrow({ where: { id: batchId }, select: { status: true } }),
]);
const totalMs = Date.now() - started;
console.log(`[load] DONE: ${delivered}/${GUESTS} SENT, batch=${batch.status}, total ${(totalMs / 1000).toFixed(1)}s`);
if (delivered !== GUESTS) throw new Error(`expected ${GUESTS} SENT, got ${delivered}`);
if (batch.status !== 'DONE') throw new Error(`expected batch DONE, got ${batch.status}`);

// Cleanup so reruns stay idempotent-ish (fresh slug each run anyway).
const guestIds = (await prisma.guest.findMany({ where: { eventId: event.id }, select: { id: true } })).map((row) => row.id);
await prisma.inviteDelivery.deleteMany({ where: { batchId } });
await prisma.inviteBatch.deleteMany({ where: { id: batchId } });
await prisma.guest.deleteMany({ where: { id: { in: guestIds } } });
await prisma.eventParticipant.deleteMany({ where: { eventId: event.id } });
await prisma.auditLog.deleteMany({ where: { targetId: event.id } });
await prisma.outboxEvent.deleteMany({ where: { payload: { path: ['eventId'], equals: event.id } } });
await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'invite-batch:load-' } } });
await prisma.event.delete({ where: { id: event.id } });
await prisma.user.delete({ where: { id: host.id } });
console.log('[load] cleaned up');
if (totalMs > BUDGET_MIN) throw new Error(`over budget: ${(totalMs / 1000).toFixed(1)}s > 300s`);
console.log(`[load] PASS: ${GUESTS} invites in ${(totalMs / 1000).toFixed(1)}s (budget 300s)`);
await prisma.$disconnect();
process.exit(0);
