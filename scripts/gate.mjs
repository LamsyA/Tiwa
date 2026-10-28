// `pnpm gate <phase>` — runs the automated checks in gates/<phase>.json.
// Every check runs (no fail-fast) so one invocation shows the whole picture.
// Exits 0 only if all checks pass.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phase = process.argv[2];

if (!phase) {
  console.error('Usage: pnpm gate <phase>');
  process.exit(2);
}

let gate;
try {
  gate = JSON.parse(readFileSync(path.join(root, 'gates', `${phase}.json`), 'utf8'));
} catch {
  console.error(`No gates/${phase}.json — nothing to run.`);
  process.exit(2);
}

const results = [];
for (const check of gate.checks ?? []) {
  const started = Date.now();
  console.log(`\n### gate ${phase} [${check.id}] $ ${check.run}`);
  const outcome = spawnSync(check.run, {
    cwd: root,
    shell: true,
    stdio: 'inherit',
    timeout: check.timeoutMs ?? 600_000,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const pass = outcome.status === 0;
  console.log(`### gate ${phase} [${check.id}] ${pass ? 'PASS' : 'FAIL'} (${seconds}s)`);
  results.push({ id: check.id, pass, seconds });
}

console.log(`\n=== gate ${phase} (${gate.name ?? 'unnamed'}) ===`);
for (const { id, pass, seconds } of results) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id} (${seconds}s)`);
}
const failed = results.filter((result) => !result.pass);
if (failed.length > 0) {
  console.error(`\ngate ${phase}: ${failed.length} check(s) failed: ${failed.map((f) => f.id).join(', ')}`);
  process.exit(1);
}
console.log(`\ngate ${phase}: all ${results.length} checks passed.`);
