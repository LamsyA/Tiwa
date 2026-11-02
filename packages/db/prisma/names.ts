// Human-sounding names for seed and load-test data, so demos and screenshots
// read like a real marketplace instead of "Load Vendor 42". Deterministic:
// the same (category, n) always gives the same name, so re-seeding is stable.

const PREFIXES = [
  'Golden',
  'Royal',
  'Ivory',
  'Emerald',
  'Crown',
  'Velvet',
  'Orchid',
  'Sapphire',
  'Amber',
  'Harmony',
  'Bloom',
  'Azure',
  'Ebony',
  'Coral',
  'Signature',
  'Grand',
  'Majestic',
  'Pearl',
  'Silverline',
  'Heritage',
  'Adunni',
  'Amara',
  'Kemi’s',
  'Tola’s',
  'Ifeoma’s',
  'Zainab’s',
  'Bisola’s',
  'Chidi’s',
  'Funke’s',
  'Ngozi’s',
  'Yemi’s',
  'Damilola’s',
  'Ola’s',
  'Eko',
  'Lekki',
  'Ikoyi',
  'Maitama',
  'Victoria',
  'Rosewood',
  'Oakridge',
];

const SUFFIXES: Record<string, string[]> = {
  venue: ['Event Centre', 'Hall', 'Gardens', 'Place', 'Pavilion', 'Event Hall'],
  catering: ['Kitchen', 'Catering', 'Cuisine', 'Pot', 'Table'],
  small_chops: ['Small Chops', 'Chops & Bites', 'Finger Foods', 'Bites'],
  drinks: ['Bar Services', 'Cocktails', 'Mixology', 'Drinks Co.'],
  cake: ['Cakes', 'Cake Studio', 'Bakery', 'Confections'],
  decor: ['Decor', 'Events & Decor', 'Styling', 'Design Studio'],
  photography: ['Photography', 'Studios', 'Lens', 'Pictures'],
  videography: ['Films', 'Motion', 'Cinematics', 'Visuals'],
  dj: ['DJ', 'Sounds', 'Beats', 'Mixes'],
  live_band: ['Band', 'Live Band', 'Ensemble', 'Highlife Band'],
  mc: ['the MC', 'Hosting', 'Live', 'on the Mic'],
  sound_lighting: ['Sound & Light', 'Audio', 'Stage & Sound', 'Lighting'],
  rentals: ['Rentals', 'Chairs & Canopies', 'Event Rentals', 'Hire'],
  makeup: ['Beauty', 'Glam', 'Makeovers', 'Bridal Glam'],
  fashion: ['Couture', 'Atelier', 'Tailoring', 'Styles'],
  printing: ['Prints', 'Stationery', 'Press', 'Invites'],
  souvenirs: ['Souvenirs', 'Gifts', 'Favours', 'Gift Studio'],
  security: ['Security', 'Guard Services', 'Protection', 'Safety'],
  ushers: ['Ushers', 'Hostesses', 'Hospitality', 'Event Staff'],
  transport: ['Rides', 'Car Hire', 'Chauffeurs', 'Transport'],
  av_production: ['Productions', 'AV', 'Stage Productions', 'Live Production'],
  speakers: ['Talent', 'Speakers Bureau', 'Talent Agency', 'Voices'],
  entertainment: ['Kids Parties', 'Fun Factory', 'Entertainment', 'Play'],
};

const DEFAULT_SUFFIXES = ['Events', 'Services', 'Co.', 'Studio'];

/** A business name for a vendor in `category`; `n` picks the combination. */
export function vendorName(category: string, n: number): string {
  const suffixes = SUFFIXES[category] ?? DEFAULT_SUFFIXES;
  const prefix = PREFIXES[n % PREFIXES.length] as string;
  const suffix = suffixes[Math.floor(n / PREFIXES.length) % suffixes.length] as string;
  return `${prefix} ${suffix}`;
}

const PLANNERS = [
  'Adunni & Co. Events',
  'The Planning Room',
  'Amara Event Studio',
  'Crown & Grace Weddings',
  'Bespoke Occasions by Kemi',
  'Velvet Rope Events',
  'Ivory Lane Planners',
  'Harmony Hosts',
];

export function plannerName(n: number): string {
  return PLANNERS[n % PLANNERS.length] as string;
}

const EVENTS = [
  'Funmi & Dayo’s Wedding',
  'Adewale’s 50th Birthday',
  'Chiamaka’s Bridal Shower',
  'Okafor Family Reunion',
  'Ngozi’s Naming Ceremony',
  'Tunde & Aisha’s Introduction',
  'Grace Church Anniversary',
  'Bola’s Graduation Party',
  'Ifeanyi’s 30th',
  'Yetunde’s Baby Shower',
  'Olumide & Kemi’s Engagement',
  'Mama Ronke’s 70th',
];

export function eventName(n: number): string {
  return EVENTS[n % EVENTS.length] as string;
}
