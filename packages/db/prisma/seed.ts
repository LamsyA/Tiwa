import { prisma } from '../src/index.js';

// P0-T07 stub: real demo data lands per phase (P2 users, P3 events, …).
// Full seed spec: Backend.md §14.
async function main() {
  await prisma.$queryRaw`SELECT 1`;
  console.log('[seed] stub OK — database reachable, no data to seed yet.');
}

await main()
  .catch((error: unknown) => {
    console.error('[seed] failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
