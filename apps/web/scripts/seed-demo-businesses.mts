// Demo marketplace for a live deployment (D-X61): 12 vendors, 5 venues and
// 3 planners with realistic (fictional) names, published profiles, packages,
// portfolio photos in object storage, priced venue spaces and an OWNER who can
// sign in with a username and password, so the full quote → booking flow
// works. Idempotent: every row hangs off a `demo-` slug and is replaced on
// each run. Run: pnpm db:seed:demo  (local)  or with -e .env.production.local.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnv } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { S3Storage } from '@tiwa/storage';
import { hashPassword } from 'better-auth/crypto';

const PASSWORD = process.env.DEMO_BUSINESS_PASSWORD ?? 'TiwaDemo2026!';
const PHOTOS = path.join(import.meta.dirname, '../public/marketplace');
const naira = (amount: number) => BigInt(amount) * 100n;

interface Pkg {
  name: string;
  price: number;
  description: string;
  includes: string[];
  addOns?: string[];
}
interface Space {
  name: string;
  indoor: boolean;
  seated: number;
  theatre?: number;
  standing: number;
  sqm: number;
  amenities: string[];
  slots: Partial<Record<'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY', number>>;
  deposit: number;
  rules: string;
}
interface Business {
  slug: string;
  kind: 'VENDOR' | 'PLANNER';
  name: string;
  owner: string;
  username: string;
  city: string;
  categories: string[];
  bio: string;
  photos: string[];
  packages: Pkg[];
  spaces?: Space[];
  rating: [number, number];
  instantBook?: boolean;
}

const BUSINESSES: Business[] = [
  // ── Vendors (12) ──
  {
    slug: 'demo-iya-ronke-kitchen',
    kind: 'VENDOR',
    name: "Iya Ronke's Kitchen",
    owner: 'Ronke Adebayo',
    username: 'iyaronke.kitchen',
    city: 'Lagos',
    categories: ['catering'],
    bio: 'Party jollof, ofada, pounded yam and continental buffets for 50 to 1,500 guests. Fifteen years feeding owambes, naming ceremonies and office parties across Lagos, with uniformed servers and clean-up included.',
    photos: ['catering-1.jpg', 'catering-2.jpg', 'catering-3.jpg'],
    packages: [
      {
        name: 'Classic buffet (100 guests)',
        price: 1_250_000,
        description: 'Two rice options, one swallow, two proteins, salad and drinks service.',
        includes: ['Jollof and fried rice', 'Pounded yam and egusi', 'Chicken and beef', '6 servers', 'Chafing dishes'],
        addOns: ['Extra 50 guests', 'Asun station', 'Takeaway packs'],
      },
      {
        name: 'Premium owambe (300 guests)',
        price: 3_600_000,
        description: 'Full Nigerian and continental spread with live cooking stations.',
        includes: ['Three rice options', 'Two swallows and soups', 'Grilled fish station', '15 servers', 'Clean-up'],
        addOns: ['Small chops', 'Cocktail bar'],
      },
    ],
    rating: [4.8, 37],
  },
  {
    slug: 'demo-crunchy-bites',
    kind: 'VENDOR',
    name: 'Crunchy Bites Small Chops',
    owner: 'Tolu Ogunleye',
    username: 'crunchybites',
    city: 'Lagos',
    categories: ['small_chops'],
    bio: 'Puff-puff, samosa, spring rolls, peppered gizzard and mini shawarma, packed or served by our hostesses. Same-week bookings welcome.',
    photos: ['chops-1.jpg', 'chops-2.jpg'],
    packages: [
      {
        name: '100 packs',
        price: 180_000,
        description: 'Six items per pack, sealed and labelled.',
        includes: ['Puff-puff', 'Samosa', 'Spring roll', 'Chicken wing', 'Gizzard', 'Mosa'],
      },
      {
        name: 'Served cocktail hour (150 guests)',
        price: 320_000,
        description: 'Trays passed by four hostesses for 90 minutes.',
        includes: ['8 items', '4 hostesses', 'Napkins and toothpicks'],
        addOns: ['Mini shawarma', 'Barbecue fish'],
      },
    ],
    rating: [4.7, 22],
    instantBook: true,
  },
  {
    slug: 'demo-sugarcraft-by-ada',
    kind: 'VENDOR',
    name: 'Sugarcraft by Ada',
    owner: 'Adaeze Nwankwo',
    username: 'sugarcraft.ada',
    city: 'Abuja',
    categories: ['cake'],
    bio: 'Tiered celebration cakes, cupcake towers and dessert tables. Fondant, buttercream and naked cakes; tastings by appointment in Wuse 2.',
    photos: ['cake-1.jpg', 'cake-2.jpg'],
    packages: [
      {
        name: 'Three-tier celebration cake',
        price: 250_000,
        description: 'Serves 120. Two flavours, custom topper.',
        includes: ['Tasting', 'Delivery in Abuja', 'Cake stand'],
      },
      {
        name: 'Dessert table',
        price: 480_000,
        description: 'Cake plus cupcakes, macarons and parfaits for 200.',
        includes: ['Two-tier cake', '100 cupcakes', 'Display setup'],
        addOns: ['Groom’s cake', 'Branded cookies'],
      },
    ],
    rating: [4.9, 41],
  },
  {
    slug: 'demo-elegance-decor',
    kind: 'VENDOR',
    name: 'Elegance Events & Decor',
    owner: 'Funmi Bakare',
    username: 'elegance.decor',
    city: 'Lagos',
    categories: ['decor'],
    bio: 'Stage backdrops, table centrepieces, ceiling drapes and floral entrances. We design to your colours and set up the night before.',
    photos: ['decor-1.jpg', 'decor-2.jpg'],
    packages: [
      {
        name: 'Essential styling (20 tables)',
        price: 950_000,
        description: 'Centrepieces, chair sashes and a stage backdrop.',
        includes: ['20 centrepieces', 'Backdrop', 'Setup and teardown'],
      },
      {
        name: 'Signature hall dressing',
        price: 2_400_000,
        description: 'Full hall transformation with drapes, lighting and fresh flowers.',
        includes: ['Ceiling drapes', 'Fresh flowers', 'Entrance arch', 'Couple’s or celebrant’s stage'],
        addOns: ['Photo booth corner', 'Extra 10 tables'],
      },
    ],
    rating: [4.8, 29],
  },
  {
    slug: 'demo-lens-and-light',
    kind: 'VENDOR',
    name: 'Lens & Light Studios',
    owner: 'Kunle Afolabi',
    username: 'lensandlight',
    city: 'Lagos',
    categories: ['photography'],
    bio: 'Documentary-style event photography. Edited gallery in 10 days, highlights shared to your Tiwa Moments album the next morning.',
    photos: ['photo-1.jpg', 'photo-2.jpg'],
    packages: [
      {
        name: 'Half day (5 hours)',
        price: 350_000,
        description: 'One photographer, 300+ edited photos.',
        includes: ['1 photographer', 'Online gallery', 'Next-day highlights'],
      },
      {
        name: 'Full day + album',
        price: 750_000,
        description: 'Two photographers and a 30-page printed album.',
        includes: ['2 photographers', '600+ edited photos', 'Printed album'],
        addOns: ['Pre-event shoot', 'Drone coverage'],
      },
    ],
    rating: [4.9, 53],
  },
  {
    slug: 'demo-reel-moments',
    kind: 'VENDOR',
    name: 'Reel Moments Films',
    owner: 'Chidi Okafor',
    username: 'reelmoments',
    city: 'Abuja',
    categories: ['videography'],
    bio: 'Cinematic event films and same-day edits. 4K cameras, gimbals and drone, with a three-minute highlight film delivered in two weeks.',
    photos: ['video-1.jpg', 'photo-2.jpg'],
    packages: [
      {
        name: 'Highlight film',
        price: 450_000,
        description: 'Three-minute film plus the full ceremony.',
        includes: ['1 videographer', '3-minute highlight', 'Full ceremony edit'],
      },
      {
        name: 'Cinematic package',
        price: 1_100_000,
        description: 'Two shooters, drone and a same-day edit for the reception.',
        includes: ['2 videographers', 'Drone', 'Same-day edit', 'Documentary film'],
      },
    ],
    rating: [4.7, 18],
  },
  {
    slug: 'demo-dj-kaycee-vibes',
    kind: 'VENDOR',
    name: 'DJ Kaycee Vibes',
    owner: 'Kayode Coker',
    username: 'djkaycee',
    city: 'Lagos',
    categories: ['dj'],
    bio: 'Afrobeats, highlife, amapiano and old-school classics read to your crowd. Own sound system for up to 400 guests.',
    photos: ['dj-1.jpg', 'dj-2.jpg'],
    packages: [
      {
        name: 'Party set (5 hours)',
        price: 250_000,
        description: 'DJ with two speakers and a wireless mic.',
        includes: ['5-hour set', '2 speakers', 'Wireless mic'],
      },
      {
        name: 'Full show',
        price: 550_000,
        description: 'DJ, hype man, full sound and dance-floor lighting.',
        includes: ['DJ and hype man', 'Line-array sound', 'Lighting'],
        addOns: ['Extra hour', 'Smoke machine'],
      },
    ],
    rating: [4.6, 34],
    instantBook: true,
  },
  {
    slug: 'demo-highlife-collective',
    kind: 'VENDOR',
    name: 'The Highlife Collective',
    owner: 'Emeka Eze',
    username: 'highlife.collective',
    city: 'Lagos',
    categories: ['live_band'],
    bio: 'Seven-piece band for highlife, juju, Afro-jazz and gospel. Popular for 60th birthdays, church thanksgivings and corporate dinners.',
    photos: ['band-1.jpg', 'sound-1.jpg'],
    packages: [
      {
        name: 'Four-piece (3 hours)',
        price: 600_000,
        description: 'Guitar, keys, drums and vocals.',
        includes: ['4 musicians', '3 hours', 'Basic PA'],
      },
      {
        name: 'Full band (5 hours)',
        price: 1_300_000,
        description: 'Seven musicians with horns and backing vocals.',
        includes: ['7 musicians', '5 hours', 'Full PA and monitors'],
      },
    ],
    rating: [4.8, 16],
  },
  {
    slug: 'demo-mc-tunde-laughs',
    kind: 'VENDOR',
    name: 'MC Tunde Laughs',
    owner: 'Tunde Balogun',
    username: 'mctunde',
    city: 'Ibadan',
    categories: ['mc'],
    bio: 'Bilingual MC (English and Yoruba) who keeps programmes on time and the room laughing. 500+ events across the South-West.',
    photos: ['band-1.jpg', 'planner-2.jpg'],
    packages: [
      {
        name: 'Standard compère',
        price: 200_000,
        description: 'Up to six hours, programme planning call included.',
        includes: ['Planning call', 'Up to 6 hours', 'Co-ordination with DJ'],
      },
    ],
    rating: [4.7, 28],
    instantBook: true,
  },
  {
    slug: 'demo-glam-by-zainab',
    kind: 'VENDOR',
    name: 'Glam by Zainab',
    owner: 'Zainab Bello',
    username: 'glambyzainab',
    city: 'Abuja',
    categories: ['makeup'],
    bio: 'Bridal, celebrant and family makeup plus gele tying. Long-wear, humidity-proof looks; we travel to your venue or hotel.',
    photos: ['makeup-1.jpg', 'makeup-2.jpg'],
    packages: [
      {
        name: 'Celebrant glam',
        price: 85_000,
        description: 'Makeup, lashes and gele for one.',
        includes: ['Makeup', 'Lashes', 'Gele tying'],
      },
      {
        name: 'Bridal party (6 people)',
        price: 380_000,
        description: 'Celebrant plus five, with a touch-up artist on the day.',
        includes: ['6 looks', 'Touch-up artist', 'Trial session'],
      },
    ],
    rating: [4.9, 47],
  },
  {
    slug: 'demo-soundwave-pro',
    kind: 'VENDOR',
    name: 'SoundWave Pro Audio',
    owner: 'Ibrahim Musa',
    username: 'soundwavepro',
    city: 'Lagos',
    categories: ['sound_lighting'],
    bio: 'Line-array sound, LED screens, stage lighting and generators for halls, gardens and conferences up to 2,000 people.',
    photos: ['sound-1.jpg', 'sound-2.jpg'],
    packages: [
      {
        name: 'Hall sound (300 guests)',
        price: 380_000,
        description: 'Speakers, mixer, four mics and an engineer.',
        includes: ['Line-array speakers', '4 wireless mics', 'Sound engineer'],
      },
      {
        name: 'Stage + LED screen',
        price: 1_200_000,
        description: 'Stage lighting rig with a 12 m² LED screen.',
        includes: ['LED screen', 'Moving heads', 'Technician crew'],
        addOns: ['20 kVA generator', 'Live streaming'],
      },
    ],
    rating: [4.6, 21],
  },
  {
    slug: 'demo-royal-rentals',
    kind: 'VENDOR',
    name: 'Royal Canopies & Rentals',
    owner: 'Gbenga Olatunji',
    username: 'royalrentals',
    city: 'Lagos',
    categories: ['rentals'],
    bio: 'Marquees, chiavari chairs, round tables, linens and cooling fans, delivered and set up anywhere in Lagos.',
    photos: ['decor-2.jpg', 'venue-3.jpg'],
    packages: [
      {
        name: '100-guest set',
        price: 220_000,
        description: '100 chairs, 10 tables, linens and one canopy.',
        includes: ['100 chairs', '10 round tables', 'Linens', 'Canopy'],
      },
      {
        name: '500-guest marquee',
        price: 1_450_000,
        description: 'Air-conditioned marquee with chairs, tables and lighting.',
        includes: ['Marquee', '500 chiavari chairs', '50 tables', 'AC units'],
      },
    ],
    rating: [4.5, 19],
  },
  // ── Venues (5) ──
  {
    slug: 'demo-the-palms-event-centre',
    kind: 'VENDOR',
    name: 'The Palms Event Centre',
    owner: 'Bisi Lawal',
    username: 'thepalms.lekki',
    city: 'Lagos',
    categories: ['venue'],
    bio: 'Two air-conditioned halls and a garden in Lekki Phase 1, with 200 parking spaces, standby power and an in-house kitchen.',
    photos: ['venue-1.jpg', 'venue-2.jpg', 'venue-3.jpg'],
    packages: [
      {
        name: 'Hall hire',
        price: 1_800_000,
        description: 'Evening slot in the Grand Hall with tables and chairs.',
        includes: ['Tables and chairs', 'Security', 'Cleaning', 'Standby power'],
      },
    ],
    spaces: [
      {
        name: 'Grand Hall',
        indoor: true,
        seated: 600,
        theatre: 900,
        standing: 1000,
        sqm: 1400,
        amenities: ['parking', 'power_backup', 'air_conditioning', 'stage', 'changing_room', 'kitchen'],
        slots: { MORNING: 1_200_000, EVENING: 1_800_000, FULL_DAY: 2_800_000 },
        deposit: 500_000,
        rules: 'Music ends at midnight. Outside caterers pay a ₦150,000 kitchen fee.',
      },
      {
        name: 'Palm Garden',
        indoor: false,
        seated: 250,
        standing: 400,
        sqm: 900,
        amenities: ['parking', 'power_backup'],
        slots: { AFTERNOON: 700_000, EVENING: 900_000 },
        deposit: 250_000,
        rules: 'Canopies required in the rainy season.',
      },
    ],
    rating: [4.7, 64],
  },
  {
    slug: 'demo-eko-terrace',
    kind: 'VENDOR',
    name: 'Eko Terrace Rooftop',
    owner: 'Seyi Williams',
    username: 'ekoterrace',
    city: 'Lagos',
    categories: ['venue'],
    bio: 'Rooftop lounge in Victoria Island overlooking the lagoon. Ideal for cocktail parties, product launches and intimate birthdays.',
    photos: ['venue-3.jpg', 'drinks-1.jpg'],
    packages: [
      {
        name: 'Rooftop evening',
        price: 950_000,
        description: 'Exclusive use from 6 pm to 11 pm.',
        includes: ['Lounge furniture', 'Bar counter', 'Ambient lighting'],
      },
    ],
    spaces: [
      {
        name: 'Rooftop Deck',
        indoor: false,
        seated: 80,
        standing: 180,
        sqm: 420,
        amenities: ['power_backup', 'sound_system', 'wheelchair_access'],
        slots: { AFTERNOON: 600_000, EVENING: 950_000 },
        deposit: 200_000,
        rules: 'No confetti cannons. Music down at 11 pm.',
      },
    ],
    rating: [4.8, 31],
  },
  {
    slug: 'demo-capital-grand-ballroom',
    kind: 'VENDOR',
    name: 'Capital Grand Ballroom',
    owner: 'Hauwa Abdullahi',
    username: 'capitalgrand',
    city: 'Abuja',
    categories: ['venue', 'catering'],
    bio: 'Central Abuja ballroom with in-house catering, built for weddings, conferences and state dinners of up to 1,200 guests.',
    photos: ['venue-2.jpg', 'venue-1.jpg'],
    packages: [
      {
        name: 'Ballroom with dinner',
        price: 6_500_000,
        description: 'Ballroom hire plus a three-course dinner for 300.',
        includes: ['Ballroom', '3-course dinner', 'Waiters', 'Stage and AV'],
      },
    ],
    spaces: [
      {
        name: 'Ballroom',
        indoor: true,
        seated: 800,
        theatre: 1200,
        standing: 1300,
        sqm: 1800,
        amenities: ['parking', 'power_backup', 'air_conditioning', 'stage', 'kitchen', 'wheelchair_access'],
        slots: { MORNING: 2_000_000, EVENING: 3_200_000, FULL_DAY: 4_800_000 },
        deposit: 1_000_000,
        rules: 'In-house catering only.',
      },
      {
        name: 'Executive Suite',
        indoor: true,
        seated: 60,
        theatre: 90,
        standing: 100,
        sqm: 150,
        amenities: ['air_conditioning', 'power_backup', 'sound_system'],
        slots: { MORNING: 400_000, AFTERNOON: 400_000, FULL_DAY: 700_000 },
        deposit: 150_000,
        rules: 'Ideal for board meetings and small receptions.',
      },
    ],
    rating: [4.6, 48],
  },
  {
    slug: 'demo-oak-garden-ibadan',
    kind: 'VENDOR',
    name: 'Oak Garden Resort',
    owner: 'Femi Adeyemi',
    username: 'oakgarden',
    city: 'Ibadan',
    categories: ['venue'],
    bio: 'Landscaped garden and chapel on the Ibadan–Ife road, with chalets for out-of-town guests.',
    photos: ['venue-3.jpg', 'decor-1.jpg'],
    packages: [
      {
        name: 'Garden day',
        price: 850_000,
        description: 'Garden and chapel for the full day.',
        includes: ['Garden', 'Chapel', 'Parking', 'Security'],
      },
    ],
    spaces: [
      {
        name: 'Main Lawn',
        indoor: false,
        seated: 400,
        standing: 600,
        sqm: 2200,
        amenities: ['parking', 'power_backup', 'changing_room'],
        slots: { MORNING: 450_000, AFTERNOON: 500_000, FULL_DAY: 850_000 },
        deposit: 200_000,
        rules: 'Events end by 10 pm.',
      },
    ],
    rating: [4.5, 23],
  },
  {
    slug: 'demo-harbour-hall-ph',
    kind: 'VENDOR',
    name: 'Harbour Hall',
    owner: 'Ebiere Douglas',
    username: 'harbourhall',
    city: 'Port Harcourt',
    categories: ['venue'],
    bio: 'Modern hall in GRA Phase 2 with a mezzanine for live bands, full air-conditioning and a 500 kVA generator.',
    photos: ['venue-1.jpg', 'sound-2.jpg'],
    packages: [
      {
        name: 'Evening hire',
        price: 1_400_000,
        description: 'Hall from 4 pm to midnight.',
        includes: ['Tables and chairs', 'Generator', 'Cleaning'],
      },
    ],
    spaces: [
      {
        name: 'Main Hall',
        indoor: true,
        seated: 500,
        theatre: 700,
        standing: 800,
        sqm: 1100,
        amenities: ['parking', 'power_backup', 'air_conditioning', 'stage', 'sound_system'],
        slots: { MORNING: 900_000, EVENING: 1_400_000, FULL_DAY: 2_100_000 },
        deposit: 400_000,
        rules: 'Outside caterers welcome.',
      },
    ],
    rating: [4.6, 27],
  },
  // ── Planners (3) ──
  {
    slug: 'demo-planner-occasions-by-temi',
    kind: 'PLANNER',
    name: 'Occasions by Temi',
    owner: 'Temitope Akinola',
    username: 'occasionsbytemi',
    city: 'Lagos',
    categories: ['weddings', 'traditional', 'birthdays'],
    bio: 'Full planning and on-the-day coordination for weddings, traditional engagements and milestone birthdays. 120+ events, one calm team.',
    photos: ['planner-1.jpg', 'planner-2.jpg', 'decor-1.jpg'],
    packages: [
      {
        name: 'Day-of coordination',
        price: 450_000,
        description: 'We take over from four weeks out and run the day.',
        includes: ['Vendor confirmations', 'Run of show', '3 coordinators on the day'],
      },
      {
        name: 'Full planning',
        price: 1_800_000,
        description: 'From budget to last dance: venue, vendors, guests and the day.',
        includes: ['Budget and timeline', 'Vendor sourcing', 'Guest management', '5 coordinators'],
      },
    ],
    rating: [4.9, 38],
  },
  {
    slug: 'demo-planner-summit-events',
    kind: 'PLANNER',
    name: 'Summit Corporate Events',
    owner: 'Olumide Fashola',
    username: 'summitevents',
    city: 'Abuja',
    categories: ['corporate', 'conferences'],
    bio: 'Conferences, product launches and end-of-year parties for banks, telcos and NGOs. Registration, AV and speaker logistics handled end to end.',
    photos: ['planner-3.jpg', 'sound-2.jpg'],
    packages: [
      {
        name: 'End-of-year party',
        price: 2_500_000,
        description: 'Theme, venue, entertainment and staff awards for up to 300.',
        includes: ['Theme concept', 'Vendor management', 'Awards segment'],
      },
      {
        name: 'Conference management',
        price: 5_500_000,
        description: 'Registration, agenda, AV, speakers and hospitality.',
        includes: ['Registration desk', 'Speaker logistics', 'AV production', 'Post-event report'],
      },
    ],
    rating: [4.7, 19],
  },
  {
    slug: 'demo-planner-heritage-ceremonies',
    kind: 'PLANNER',
    name: 'Heritage Ceremonies',
    owner: 'Ngozi Umeh',
    username: 'heritageceremonies',
    city: 'Port Harcourt',
    categories: ['funerals', 'religious', 'reunions'],
    bio: 'Respectful planning for funerals, memorial services, church thanksgivings and family reunions, including programmes, souvenirs and logistics.',
    photos: ['planner-4.jpg', 'gifts-1.jpg'],
    packages: [
      {
        name: 'Memorial service',
        price: 900_000,
        description: 'Programme, venue, canopies, catering and souvenirs.',
        includes: ['Programme printing', 'Venue and canopies', 'Catering coordination', 'Souvenirs'],
      },
    ],
    rating: [4.8, 14],
  },
];

async function wipe() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: 'demo-' } },
    select: { id: true },
  });
  const orgIds = orgs.map((row) => row.id);
  if (orgIds.length > 0) {
    // Bookings and quotes made against the demo businesses stay; only the
    // catalogue rows below are rebuilt, so re-running never breaks a booking.
    await prisma.portfolioItem.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.servicePackage.updateMany({ where: { orgId: { in: orgIds } }, data: { active: false } });
  }
}

async function main() {
  const env = loadEnv();
  const storage = new S3Storage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET_PRIVATE,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  });
  await wipe();
  const hash = await hashPassword(PASSWORD);
  const now = new Date();

  for (const business of BUSINESSES) {
    const email = `${business.username}@user.tiwa.local`;
    const user = await prisma.user.upsert({
      where: { username: business.username },
      update: { name: business.owner, onboardedAt: now },
      create: {
        email,
        name: business.owner,
        username: business.username,
        displayUsername: business.username,
        countryCode: 'NG',
        emailVerified: false,
        onboardedAt: now,
      },
      select: { id: true },
    });
    const account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
      select: { id: true },
    });
    if (account) {
      await prisma.account.update({ where: { id: account.id }, data: { password: hash } });
    } else {
      await prisma.account.create({
        data: { id: randomUUID(), userId: user.id, accountId: user.id, providerId: 'credential', password: hash },
      });
    }

    const org = await prisma.organization.upsert({
      where: { slug: business.slug },
      update: { name: business.name, city: business.city, verification: 'APPROVED', deletedAt: null },
      create: {
        kind: business.kind,
        name: business.name,
        slug: business.slug,
        countryCode: 'NG',
        city: business.city,
        verification: 'APPROVED',
      },
      select: { id: true },
    });
    await prisma.membership.upsert({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
      update: { role: 'OWNER' },
      create: { orgId: org.id, userId: user.id, role: 'OWNER' },
    });

    const prices = business.packages.map((p) => p.price);
    const profileData = {
      categories: business.categories,
      bio: business.bio,
      city: business.city,
      currency: 'NGN',
      startingPriceMinor: naira(Math.min(...prices)),
      published: true,
      instantBook: business.instantBook ?? false,
      availabilityConfirmedAt: now,
      ratingAvg: business.rating[0],
      ratingCount: business.rating[1],
      completedBookings: Math.round(business.rating[1] * 1.4),
      searchText: `${business.name} ${business.city} ${business.categories.join(' ')} ${business.bio}`,
    };
    const profile = await prisma.businessProfile.upsert({
      where: { orgId: org.id },
      update: profileData,
      create: { orgId: org.id, ...profileData },
      select: { id: true },
    });

    for (const pkg of business.packages) {
      await prisma.servicePackage.create({
        data: {
          orgId: org.id,
          name: pkg.name,
          description: pkg.description,
          priceMinor: naira(pkg.price),
          currency: 'NGN',
          includes: pkg.includes,
          addOns: pkg.addOns ?? [],
        },
      });
    }

    if (business.spaces) {
      await prisma.venueSpace.updateMany({ where: { profileId: profile.id }, data: { active: false } });
      for (const space of business.spaces) {
        const data = {
          indoor: space.indoor,
          capacitySeated: space.seated,
          capacityTheatre: space.theatre ?? null,
          capacityStanding: space.standing,
          sizeSqm: space.sqm,
          amenities: space.amenities,
          rules: space.rules,
          slotPrices: Object.fromEntries(
            Object.entries(space.slots).map(([slot, amount]) => [slot, String(naira(amount))]),
          ),
          securityDepositMinor: naira(space.deposit),
          active: true,
        };
        const existing = await prisma.venueSpace.findFirst({
          where: { profileId: profile.id, name: space.name },
          select: { id: true },
        });
        if (existing) await prisma.venueSpace.update({ where: { id: existing.id }, data });
        else await prisma.venueSpace.create({ data: { profileId: profile.id, name: space.name, ...data } });
      }
    }

    for (const [index, file] of business.photos.entries()) {
      const key = `business/${org.id}/portfolio/demo-${index}.jpg`;
      await storage.put(key, readFileSync(path.join(PHOTOS, file)), 'image/jpeg');
      await prisma.portfolioItem.create({
        data: { orgId: org.id, kind: 'PHOTO', key, sortOrder: index, approvedAt: now },
      });
    }
    console.log(
      `[demo] ${business.kind === 'PLANNER' ? 'planner' : business.spaces ? 'venue' : 'vendor'}: ${business.name} (@${business.username})`,
    );
  }
  console.log(
    `[demo] ${BUSINESSES.length} businesses ready. Owner password: set by DEMO_BUSINESS_PASSWORD or the default.`,
  );
}

await main()
  .catch((error: unknown) => {
    console.error('[demo] failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
