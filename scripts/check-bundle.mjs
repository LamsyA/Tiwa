// Enforces .size-limit.json: sums gzipped First Load JS per route from
// apps/web/.next/build-manifest.json (exact with hashed chunk names).
// Usage: build the web app first (`pnpm --filter @tiwa/web build`), then
// `node scripts/check-bundle.mjs`. Exits non-zero on any breach.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextDir = path.join(root, 'apps/web/.next');
const budgets = JSON.parse(readFileSync(path.join(root, '.size-limit.json'), 'utf8')).routes;

let manifest;
try {
  manifest = JSON.parse(readFileSync(path.join(nextDir, 'build-manifest.json'), 'utf8'));
} catch {
  console.error('No apps/web/.next/build-manifest.json — run `pnpm --filter @tiwa/web build` first.');
  process.exit(2);
}

let failed = false;
for (const [route, budget] of Object.entries(budgets)) {
  const files = [...new Set([...(manifest.pages?.[route] ?? []), ...(manifest.pages?.['/_app'] ?? [])])].filter(
    (file) => file.endsWith('.js'),
  );
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
