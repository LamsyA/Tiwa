// One-off: give existing demo / load / e2e-leftover rows the human names that
// seed.ts and seed-load.ts now generate (names.ts). Idempotent; only touches
// rows created by the seeds or by e2e runs, identified by slug or name pattern.
// Usage: pnpm --filter @tiwa/db exec dotenv -e ../../.env -- tsx prisma/rename-demo-names.ts
import { prisma } from '../src/index.js';
import { eventName, plannerName, vendorName } from './names.js';

async function main() {
  const orgs = await prisma.organization.findMany({
    where: {
      OR: [
        { slug: { startsWith: 'load-vendor-' } },
        { slug: { startsWith: 'seed-vendor-' } },
        { slug: { startsWith: 'seed-planner-' } },
        { name: { startsWith: 'E2E ' } },
        { name: { startsWith: 'Repro Vendor' } },
        { name: { startsWith: 'Load Vendor' } },
        { name: { startsWith: 'Seed Planner' } },
      ],
    },
    select: { id: true, slug: true, name: true, kind: true, city: true },
  });
  const profiles = new Map(
    (
      await prisma.businessProfile.findMany({
        where: { orgId: { in: orgs.map((row) => row.id) } },
        select: { orgId: true, categories: true },
      })
    ).map((row) => [row.orgId, row.categories]),
  );

  let renamed = 0;
  for (const [index, org] of orgs.entries()) {
    // e2e fixtures keep their names: specs look them up (seed-vendor-e2e, seed-planner-e2e, …).
    if (org.slug.endsWith('-e2e') || org.slug.includes('-e2e-')) continue;
    const category = profiles.get(org.id)?.[0] ?? 'decor';
    const number = Number(/(\d+)$/.exec(org.slug)?.[1] ?? index);
    const name =
      org.kind === 'PLANNER'
        ? plannerName(number - 1)
        : org.slug.startsWith('seed-vendor-')
          ? vendorName(category, number * 7)
          : vendorName(category, Math.floor(number / 23) + (index % 3));
    if (name === org.name) continue;
    await prisma.organization.update({ where: { id: org.id }, data: { name } });
    await prisma.businessProfile.updateMany({
      where: { orgId: org.id },
      data: {
        searchText: `${name} ${org.city ?? ''} ${category}`,
        bio:
          org.kind === 'PLANNER'
            ? `${name} — full planning and on-the-day coordination.`
            : `${name} — trusted for weddings, birthdays and corporate events in ${org.city ?? 'your city'}.`,
      },
    });
    renamed += 1;
  }

  const events = await prisma.event.findMany({
    where: { name: { startsWith: 'Seed Plan Event' } },
    select: { id: true, slug: true },
  });
  for (const event of events) {
    const number = Number(/(\d+)$/.exec(event.slug)?.[1] ?? 1);
    await prisma.event.update({ where: { id: event.id }, data: { name: eventName(number - 1) } });
  }
  console.log(`[rename] ${renamed} businesses and ${events.length} events renamed.`);
}

await main()
  .catch((error: unknown) => {
    console.error('[rename] failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
