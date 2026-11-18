import { prisma } from '../src/index.js';

/**
 * D-X90: planners and vendors must have a business phone and email. Demo and
 * test businesses created before that rule get stand-in contacts so their
 * accounts open without the "add your contact" step. Real businesses are
 * never touched: only orgs still missing a value are filled, and the phone
 * is a reserved Nigerian test range (+234 800 000 xxxx).
 * Run: pnpm --filter @tiwa/db demo:contacts
 */
export async function fillDemoContacts(): Promise<number> {
  const orgs = await prisma.organization.findMany({
    where: { kind: { in: ['PLANNER', 'VENDOR'] }, OR: [{ contactPhone: null }, { contactEmail: null }] },
    select: { id: true, slug: true, contactPhone: true, contactEmail: true },
  });
  let n = 0;
  for (const org of orgs) {
    n += 1;
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        contactPhone: org.contactPhone ?? `+234800000${String(n % 10000).padStart(4, '0')}`,
        contactEmail: org.contactEmail ?? `hello@${org.slug.slice(0, 50)}.tiwa-demo.app`,
      },
    });
  }
  return orgs.length;
}

if (process.argv[1]?.endsWith('demo-contacts.ts')) {
  fillDemoContacts()
    .then((count) => console.log(`[demo-contacts] filled ${count} businesses`))
    .finally(() => void prisma.$disconnect());
}
