// P6-T19 / GATE P6 load test: 1,000 connected inbox streams, 50 messages/s,
// delivery p95 < 2 s (D-X24). Opens real signed-in `GET /api/sse/inbox`
// streams against a running server, publishes chat events through Redis on
// the same `inbox:user:{id}` channels the app uses, and measures
// publish → event-received latency at each stream.
//
// Usage (server running with the same .env):
//   ulimit -n 10240
//   BASE_URL=http://localhost:3100 node --env-file=.env scripts/load-chat.mjs
// Env: STREAMS (1000), RATE (50 msg/s), DURATION_SEC (60), RAMP_SEC (20).
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'packages/db/package.json'));
const { PrismaClient } = require('@prisma/client');
const { Redis } = createRequire(path.join(root, 'apps/web/package.json'))('ioredis');

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const STREAMS = Number(process.env.STREAMS ?? 1000);
const RATE = Number(process.env.RATE ?? 50);
const DURATION_SEC = Number(process.env.DURATION_SEC ?? 60);
const RAMP_SEC = Number(process.env.RAMP_SEC ?? 20);
const SECRET = process.env.AUTH_SECRET ?? 'dev-only-secret-change-me-in-production-000000';
const PREFIX = 'load-chat-';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

/** Better Auth session cookie: `${token}.${base64(HMAC-SHA256(token))}`, URI-encoded (better-call). */
async function signedCookie(token) {
  const key = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = Buffer.from(await webcrypto.subtle.sign('HMAC', key, new TextEncoder().encode(token))).toString(
    'base64',
  );
  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

async function setup() {
  await prisma.session.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  const users = [];
  const expiresAt = new Date(Date.now() + 86_400_000);
  for (let i = 0; i < STREAMS; i += 1) {
    const token = webcrypto.randomUUID().replaceAll('-', '');
    const user = await prisma.user.create({
      data: {
        email: `${PREFIX}${i}@tiwa.test`,
        name: `Load ${i}`,
        countryCode: 'NG',
        sessions: { create: { id: webcrypto.randomUUID(), token, expiresAt } },
      },
      select: { id: true },
    });
    users.push({ id: user.id, cookie: await signedCookie(token) });
  }
  return users;
}

function percentile(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : NaN;
}

async function openStream(user, latencies, state) {
  const response = await fetch(`${BASE_URL}/api/sse/inbox`, {
    headers: { cookie: user.cookie, accept: 'text/event-stream' },
    signal: state.abort.signal,
  });
  if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let ready = false;
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index;
        while ((index = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          if (frame.includes('event: ready')) {
            if (!ready) state.ready += 1;
            ready = true;
          } else if (frame.includes('event: message')) {
            const data = frame.split('\n').find((line) => line.startsWith('data: '));
            if (data) latencies.push(Date.now() - JSON.parse(data.slice(6)).at);
          }
        }
      }
    } catch {
      // aborted at the end
    }
    if (!state.abort.signal.aborted) state.dropped += 1;
  })();
}

const users = await setup();
console.log(`[load-chat] ${users.length} users with sessions; opening streams over ${RAMP_SEC}s…`);
const latencies = [];
const state = { ready: 0, dropped: 0, failed: 0, abort: new AbortController() };
const gap = (RAMP_SEC * 1000) / users.length;
for (const user of users) {
  openStream(user, latencies, state).catch(() => (state.failed += 1));
  await new Promise((resolve) => setTimeout(resolve, gap));
}
const deadline = Date.now() + 30_000;
while (state.ready + state.failed < users.length && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 250));
}
console.log(`[load-chat] streams ready: ${state.ready}, failed: ${state.failed}`);

let sent = 0;
const started = Date.now();
const timer = setInterval(() => {
  for (let i = 0; i < RATE / 10; i += 1) {
    const target = users[sent % users.length];
    sent += 1;
    void redis.publish(
      `inbox:user:${target.id}`,
      JSON.stringify({
        type: 'message',
        threadId: 'load',
        messageId: `m${sent}`,
        authorUserId: 'load',
        at: Date.now(),
      }),
    );
  }
}, 100);
await new Promise((resolve) => setTimeout(resolve, DURATION_SEC * 1000));
clearInterval(timer);
await new Promise((resolve) => setTimeout(resolve, 3000)); // let the last events land

const sorted = [...latencies].sort((a, b) => a - b);
const report = {
  streams: users.length,
  ready: state.ready,
  failed: state.failed,
  dropped: state.dropped,
  sent,
  received: latencies.length,
  rate: Math.round(sent / ((Date.now() - started - 3000) / 1000)),
  p50: percentile(sorted, 50),
  p95: percentile(sorted, 95),
  p99: percentile(sorted, 99),
  max: sorted.at(-1),
};
console.log(`[load-chat] ${JSON.stringify(report)}`);
state.abort.abort();
await prisma.session.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
await prisma.$disconnect();
redis.disconnect();
const pass = report.ready === users.length && report.received >= sent * 0.99 && report.p95 < 2000;
console.log(pass ? '[load-chat] PASS' : '[load-chat] FAIL');
process.exit(pass ? 0 : 1);
