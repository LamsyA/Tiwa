/* global __ENV, __VU, __ITER, open -- k6 runtime globals (not Node) */
// P4-T12: k6 load profile for the guest-facing invite surface.
// Exercises what 2,000 real guests do: open the personal link, answer the
// RSVP, download the .ics — against production-shaped traffic.
//
// Tokens come from the send-pipeline harness (which creates real guests):
//   pnpm load:invites --guests=500 --export-tokens=/tmp/load-tokens.json --no-cleanup
//   k6 run -e BASE_URL=http://localhost:3000 -e TOKENS_FILE=/tmp/load-tokens.json \
//     -e VUS=20 -e ITERATIONS=10 scripts/load-invites-k6.js
//
// Each VU walks its own slice of tokens so the per-token RSVP rate limit
// (10/hour) never trips. Requires k6: `brew install k6`.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TOKENS_FILE = __ENV.TOKENS_FILE || '/tmp/load-tokens.json';
const VUS = Number(__ENV.VUS || 20);
const ITERATIONS = Number(__ENV.ITERATIONS || 10);

const tokens = new SharedArray('tokens', () => {
  const raw = open(TOKENS_FILE);
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(`no tokens in ${TOKENS_FILE}`);
  return parsed;
});

export const options = {
  vus: VUS,
  iterations: VUS * ITERATIONS,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
  },
};

export default function main() {
  // Distinct slice per VU so tokens (and their RSVP rate limits) don't collide.
  const token = tokens[(__VU - 1 + __ITER * VUS) % tokens.length];

  const page = http.get(`${BASE_URL}/i/${token}`, { tags: { name: 'invite-page' } });
  check(page, { 'invite page 200': (r) => r.status === 200 });

  const answer = __ITER % 2 === 0 ? 'YES' : 'NO';
  const rsvp = http.post(`${BASE_URL}/api/rsvp`, JSON.stringify({ token, response: answer }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'rsvp' },
  });
  check(rsvp, { 'rsvp 200': (r) => r.status === 200 });

  const ics = http.get(`${BASE_URL}/api/ics/${token}`, { tags: { name: 'ics' } });
  check(ics, {
    'ics 200': (r) => r.status === 200,
    'ics is calendar': (r) => (r.headers['Content-Type'] || '').includes('text/calendar'),
  });

  sleep(0.2);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: false }),
  };
}
