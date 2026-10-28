// Enforces .size-limit.json: sums gzipped First Load JS per route from
// apps/web/.next/app-build-manifest.json (exact with hashed chunk names).
// App Router manifest keys are `<route>/page` (`/` → `/page`).
// Usage: build the web app first (`pnpm --filter @tiwa/web build`), then
// `node scripts/check-bundle.mjs`. Exits non-zero on any breach.
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextDir = path.join(root, 'apps/web/.next');
const budgets = JSON.parse(readFileSync(path.join(root, '.size-limit.json'), 'utf8')).routes;

let manifest;
try {
  manifest = JSON.parse(readFileSync(path.join(nextDir, 'app-build-manifest.json'), 'utf8'));
} catch {
  console.error('No apps/web/.next/app-build-manifest.json — run `pnpm --filter @tiwa/web build` first.');
  process.exit(2);
}

// Bail out loudly on a dev-server manifest (local e2e uses .next-dev, but a
// stray `next dev` without the Playwright env would still clobber .next).
if (!existsSync(path.join(nextDir, 'BUILD_ID'))) {
  console.error('apps/web/.next is not a production build — run `pnpm --filter @tiwa/web build` first.');
  process.exit(2);
}

const toManifestKey = (route) => (route === '/' ? '/page' : `${route}/page`);

let failed = false;
for (const [route, budget] of Object.entries(budgets)) {
  const files = [...new Set(manifest.pages?.[toManifestKey(route)] ?? [])].filter((file) => file.endsWith('.js'));
  if (files.length === 0) {
    console.error(`No JS found for route ${route} — did the route get renamed?`);
    failed = true;
    continue;
  }
  let total = 0;
  for (const file of files) {
    total += gzipSync(readFileSync(path.join(nextDir, file))).length;
  }
  const kb = total / 1024;
  const ok = kb <= budget.gzipKB;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${route}: ${kb.toFixed(1)} KB gzip (budget ${budget.gzipKB} KB, ${budget.class})`,
  );
}

process.exit(failed ? 1 : 0);
