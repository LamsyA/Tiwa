// Wait until Postgres answers a real query (not just TCP-open: on fresh
// volumes the proxy can accept sockets before PG finishes starting).
// Runs inside packages/db via dotenv, so DATABASE_URL is already set.
// Usage: dotenv -e ../../.env -- node ../../scripts/wait-for-db.mjs
import { spawnSync } from 'node:child_process';

const deadline = Date.now() + 120_000;
let attempt = 0;

for (;;) {
  attempt += 1;
  const result = spawnSync('prisma', ['db', 'execute', '--schema', 'prisma/schema.prisma', '--stdin'], {
    input: 'SELECT 1;',
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (result.status === 0) {
    console.log(`postgres ready (attempt ${attempt})`);
    process.exit(0);
  }
  if (Date.now() > deadline) {
    console.error(`postgres not ready after ${attempt} attempts`);
    console.error((result.stderr || result.stdout || '').toString().slice(0, 2000));
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
