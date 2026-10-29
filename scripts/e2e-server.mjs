// Playwright webServer for local runs: serve the production build, like CI.
// `next dev` recompiles routes mid-test and Fast Refresh remounts forms, which
// made multi-step flows flaky (D-X09). Rebuilds only when sources are newer
// than the last build, so repeated runs start in seconds.
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildId = path.join(root, 'apps/web/.next/BUILD_ID');
const SOURCES = ['apps/web', 'packages/ui/src', 'packages/core/src', 'packages/config/src', 'packages/db/src'];
const SKIP = new Set(['node_modules', '.next', '.next-dev', '.turbo', 'dist', 'test-results']);

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
  }
  return newest;
}

const builtAt = existsSync(buildId) ? statSync(buildId).mtimeMs : 0;
const sourcesAt = Math.max(...SOURCES.map((dir) => newestMtime(path.join(root, dir))));
if (sourcesAt > builtAt) {
  console.log('[e2e-server] sources changed since the last build — building apps/web');
  const build = spawnSync('pnpm', ['--filter', '@tiwa/web', 'build'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const server = spawn('pnpm', ['--filter', '@tiwa/web', 'start'], { cwd: root, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
