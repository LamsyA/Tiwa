import { spawn, spawnSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { prisma } from '@tiwa/db';

/**
 * GATE P5 load test (UF-10): 500 concurrent guest uploaders to one gallery.
 * Hermetic: creates a throwaway birthday event + gallery, runs k6 against a
 * scratch prod server on :3003, then deletes every trace (media, sessions,
 * outbox rows, gallery, event). Usage: `pnpm --filter @tiwa/worker load:gallery`.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WEB = path.join(root, 'apps/web');
const PORT = 3003;
const BASE = `http://localhost:${PORT}`;

function fail(message: string): never {
  console.error(`[load:gallery] ${message}`);
  process.exit(1);
}

try {
  execFileSync('k6', ['version'], { stdio: 'ignore' });
} catch {
  fail('k6 binary not found — install k6 (https://k6.io/docs/get-started/installation/) to run this gate check.');
}

const host = await prisma.user.findFirst({ where: { email: 'demo@tiwa.test' }, select: { id: true } });
if (!host) fail('demo@tiwa.test missing — run `pnpm db:seed` first.');

const { createEventDraft, finalizeEvent } = await import('@tiwa/core');
const { eventId } = await createEventDraft({ kind: 'user', userId: host!.id, isAdmin: false }, { type: 'birthday' });
await prisma.event.update({
  where: { id: eventId },
  data: { startsAt: new Date(Date.now() + 30 * 86400000), endsAt: new Date(Date.now() + 30 * 86400000 + 5 * 3600000) },
});
await finalizeEvent({ kind: 'user', userId: host!.id, isAdmin: false }, { eventId });
const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId }, select: { id: true, code: true } });
// Load profile, not plan enforcement (limits are unit-tested): room for thousands of rows.
await prisma.gallery.update({ where: { id: gallery.id }, data: { plan: 'PLUS', itemLimit: 10000 } });
console.log(`[load:gallery] throwaway gallery ${gallery.code} (${gallery.id})`);

const dbUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://tiwa:tiwa@localhost:5432/tiwa');
dbUrl.searchParams.set('connection_limit', '50');
dbUrl.searchParams.set('pool_timeout', '30');
const server = spawn(
  path.join(root, 'apps/worker/node_modules/.bin/dotenv'),
  ['-e', '../../.env', '--', path.join(root, 'apps/web/node_modules/.bin/next'), 'start', '-p', String(PORT)],
  { cwd: WEB, stdio: 'inherit', env: { ...process.env, DATABASE_URL: dbUrl.toString() } },
);
let ready = false;
for (let i = 0; i < 60 && !ready; i += 1) {
  await sleep(2000);
  try {
    const response = await fetch(`${BASE}/api/health`);
    ready = response.ok;
  } catch {
    // not up yet
  }
}
if (!ready) {
  server.kill('SIGTERM');
  fail('prod web server did not become ready on :3003');
}

const k6 = spawnSync('k6', ['run', '--quiet', path.join(root, 'scripts/load-gallery-uploads-k6.js')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, BASE_URL: BASE, EVENT_ID: eventId, CODE: gallery.code },
});

// Cleanup first so a failed threshold never leaks rows into the demo DB.
// Outbox rows are scoped to this run's media ids (never blanket-delete:
// a parallel worker could own other rows).
const mediaIds = (await prisma.mediaItem.findMany({ where: { galleryId: gallery.id }, select: { id: true } })).map(
  (row) => row.id,
);
await prisma.outboxEvent.deleteMany({
  where: {
    OR: mediaIds.flatMap((mediaId) => [
      { topic: 'media/process-image', payload: { path: ['mediaItemId'], equals: mediaId } },
      { topic: 'media/watermark', payload: { path: ['mediaItemId'], equals: mediaId } },
      { topic: 'media/moderate', payload: { path: ['mediaItemId'], equals: mediaId } },
    ]),
  },
});
await prisma.mediaItem.deleteMany({ where: { galleryId: gallery.id } });
await prisma.guestSession.deleteMany({ where: { galleryId: gallery.id } });
await prisma.guestbookMessage.deleteMany({ where: { galleryId: gallery.id } });
await prisma.gallery.deleteMany({ where: { id: gallery.id } });
await prisma.task.deleteMany({ where: { eventId } });
await prisma.programmeItem.deleteMany({ where: { eventId } });
await prisma.eventDay.deleteMany({ where: { eventId } });
await prisma.budgetCategory.deleteMany({ where: { eventId } });
await prisma.eventParticipant.deleteMany({ where: { eventId } });
await prisma.event.deleteMany({ where: { id: eventId } });
console.log(`[load:gallery] cleaned up ${mediaIds.length} media rows + gallery + event`);
server.kill('SIGTERM');

if (k6.status !== 0) fail('k6 thresholds failed (see above) — error rate ≥ 1% or p95 create ≥ 300 ms.');
console.log('[load:gallery] PASS: 500 concurrent uploaders, error rate < 1%, p95 create < 300 ms.');
