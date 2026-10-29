// Enforces .size-limit.json: First Load JS per route, measured the honest way —
// boot `next start`, fetch the route's HTML, gzip every `/_next/static/**/*.js`
// it references. Version-proof (no build-manifest internals).
// Usage: build the web app first (`pnpm --filter @tiwa/web build`), then
// `node scripts/check-bundle.mjs`. Breaches are warnings until P17 (D-X05);
// set SIZE_STRICT=1 to exit non-zero on any breach.
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextDir = path.join(root, 'apps/web/.next');
const budgets = JSON.parse(readFileSync(path.join(root, '.size-limit.json'), 'utf8')).routes;

if (!existsSync(path.join(nextDir, 'BUILD_ID'))) {
  console.error('apps/web/.next is not a production build — run `pnpm --filter @tiwa/web build` first.');
  process.exit(2);
}

const PORT = 3101;
const server = spawn(
  'pnpm',
  ['--filter', '@tiwa/web', 'exec', 'dotenv', '-e', '../../.env', '--', 'next', 'start', '-p', String(PORT)],
  { cwd: root, stdio: 'ignore' },
);

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const response = await fetch(`http://localhost:${PORT}/api/health`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error('timed out waiting for next start');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const strict = process.env.SIZE_STRICT === '1';
let failed = false;
try {
  await waitForServer();
  for (const [route, budget] of Object.entries(budgets)) {
    const html = await (await fetch(`http://localhost:${PORT}${route}`)).text();
    // Exclude legacy-only polyfills (nomodule) and error-boundary chunks —
    // neither is part of first paint on modern browsers.
    const excluded = new Set();
    for (const [, tag] of html.matchAll(/<script([^>]*)>/gi)) {
      const src = /src="([^"]+)"/i.exec(tag)?.[1]?.split('?')[0];
      if (src && (/\snomodule[\s=/>]/i.test(tag) || src.includes('/global-error'))) excluded.add(src);
    }
    const files = [
      ...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"'\s]+\.js/gi)].map((match) => match[0].split('?')[0])),
    ].filter((file) => file !== undefined && !excluded.has(file));
    if (files.length === 0) {
      console.error(`No JS found for route ${route} — did the route get renamed?`);
      failed = true;
      continue;
    }
    let total = 0;
    for (const file of files) {
      total += gzipSync(readFileSync(path.join(nextDir, 'static', file.split('/static/')[1]))).length;
    }
    const kb = total / 1024;
    const ok = kb <= budget.gzipKB;
    if (!ok && strict) failed = true;
    console.log(
      `${ok ? 'PASS' : strict ? 'FAIL' : 'WARN'} ${route}: ${kb.toFixed(1)} KB gzip (budget ${budget.gzipKB} KB, ${budget.class})`,
    );
  }
} finally {
  server.kill('SIGTERM');
}

process.exit(failed ? 1 : 0);
