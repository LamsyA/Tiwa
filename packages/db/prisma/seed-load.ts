// P6-T10: 5 000-vendor load set for the UF-14-1 search gate (<300 ms p95).
// Slug-prefixed so it never collides with the curated seed; idempotent.
// Usage: pnpm db:seed:load
import { VENDOR_CATEGORIES } from '@tiwa/config';
import { prisma } from '../src/index.js';

const CITIES = ['Lagos', 'Lagos', 'Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Lagos', 'Kano'];
const KEYS = Object.keys(VENDOR_CATEGORIES);

async function main() {
  const existing = await prisma.organization.findMany({
    where: { slug: { startsWith: 'load-vendor-' } },
    select: { id: true },
  });
  if (existing.length > 0) {
    const ids = existing.map((row) => row.id);
    await prisma.businessProfile.deleteMany({ where: { orgId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
    console.log(`[seed:load] wiped ${ids.length} previous load vendors.`);
  }
  const BATCH = 500;
  for (let start = 0; start < 5000; start += BATCH) {
    const orgs = Array.from({ length: BATCH }, (_, i) => {
      const n = start + i + 1;
      const city = CITIES[n % CITIES.length] as string;
      return {
        kind: 'VENDOR' as const,
        name: `Load Vendor ${n}`,
        slug: `load-vendor-${String(n).padStart(4, '0')}`,
        countryCode: 'NG',
        city,
        verification: (n % 4 === 0 ? 'APPROVED' : 'NONE') as 'APPROVED' | 'NONE',
      };
    });
    await prisma.organization.createMany({ data: orgs });
    const created = await prisma.organization.findMany({
      where: { slug: { startsWith: 'load-vendor-' } },
      select: { id: true, name: true, city: true },
    });
    const byName = new Map(created.map((row) => [row.name, row]));
    const profiles = orgs.map((org, i) => {
      const n = start + i + 1;
      const category = KEYS[n % KEYS.length] as string;
      const row = byName.get(org.name);
      return {
        orgId: row?.id ?? '',
        categories: [category],
        bio: `Load vendor ${n} for search performance.`,
        city: org.city as string,
        currency: 'NGN',
        startingPriceMinor: BigInt(50_000_00 + ((n * 7919) % 900_000_00)),
        published: true,
        ratingAvg: n % 3 === 0 ? 4 + (n % 10) / 10 : null,
        ratingCount: n % 3 === 0 ? 6 + (n % 40) : 0,
        searchText: `Load Vendor ${n} ${org.city} ${category}`,
      };
    });
    await prisma.businessProfile.createMany({ data: profiles.filter((p) => p.orgId !== '') });
    console.log(`[seed:load] ${Math.min(start + BATCH, 5000)}/5000`);
  }
  console.log('[seed:load] done: 5000 published load vendors.');
}

await main()
  .catch((error: unknown) => {
    console.error('[seed:load] failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
