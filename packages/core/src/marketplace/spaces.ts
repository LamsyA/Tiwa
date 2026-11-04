import { VENUE_AMENITY_KEYS } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { sniffMime, type Storage } from '@tiwa/storage';
import { z } from 'zod';
import type { Actor } from '../auth/authorize.js';
import { authorizeOrg, type OrgAction } from '../auth/org.js';
import { ConflictError, NotFoundError, ValidationError } from '../shared/errors.js';
import { uuidv7 } from '../shared/ids.js';
import { audit } from '../shared/outbox.js';
import { capUpload } from '../shared/upload-limit.js';

// Venue spaces (P6-T08): halls, gardens, conference rooms inside a venue
// business. Only orgs whose profile lists the `venue` category may manage
// spaces. Photos reuse the single-PUT + magic-byte pattern (D-A05).
// (VENUE_AMENITY_KEYS / DAY_SLOTS live in @tiwa/config: client-safe.)

type UserActor = Extract<Actor, { kind: 'user' }>;

const slotPricesSchema = z
  .object({
    MORNING: z.string().regex(/^\d+$/).optional(),
    AFTERNOON: z.string().regex(/^\d+$/).optional(),
    EVENING: z.string().regex(/^\d+$/).optional(),
    FULL_DAY: z.string().regex(/^\d+$/).optional(),
  })
  .default({});

async function loadAccess(actor: UserActor, orgId: string, action: OrgAction) {
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId: actor.userId } },
  });
  authorizeOrg(actor, action, orgId, membership ? { orgId, role: membership.role } : null);
}

async function requireVenue(orgId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (org.kind !== 'VENDOR') throw new ConflictError('Only vendors have spaces', { reason: 'not-a-vendor' });
  const profile = await prisma.businessProfile.findUnique({ where: { orgId } });
  if (!profile?.categories.includes('venue'))
    throw new ConflictError('Not a venue business', { reason: 'not-a-venue' });
  return org;
}

export const saveSpaceSchema = z.object({
  orgId: z.string().uuid(),
  spaceId: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'nameRequired').max(120, 'nameTooLong'),
  indoor: z.boolean().default(true),
  capacitySeated: z.number().int().min(0).max(100000).optional(),
  capacityTheatre: z.number().int().min(0).max(100000).optional(),
  capacityStanding: z.number().int().min(0).max(100000).optional(),
  sizeSqm: z.number().int().min(0).max(1000000).optional(),
  amenities: z.array(z.enum(VENUE_AMENITY_KEYS)).max(20).default([]),
  rules: z.string().trim().max(2000, 'rulesTooLong').optional(),
  slotPrices: slotPricesSchema,
  setupMinutes: z.number().int().min(0).max(1440).default(120),
  teardownMinutes: z.number().int().min(0).max(1440).default(60),
  securityDepositMinor: z.string().regex(/^\d+$/, 'priceInvalid').optional(),
  active: z.boolean().default(true),
});

export async function saveSpace(actor: UserActor, raw: z.input<typeof saveSpaceSchema>) {
  const input = saveSpaceSchema.parse(raw);
  await loadAccess(actor, input.orgId, 'org.manage');
  await requireVenue(input.orgId);
  const profile = await prisma.businessProfile.findUniqueOrThrow({ where: { orgId: input.orgId } });
  const data = {
    name: input.name,
    indoor: input.indoor,
    capacitySeated: input.capacitySeated ?? null,
    capacityTheatre: input.capacityTheatre ?? null,
    capacityStanding: input.capacityStanding ?? null,
    sizeSqm: input.sizeSqm ?? null,
    amenities: input.amenities,
    rules: input.rules || null,
    slotPrices: input.slotPrices,
    setupMinutes: input.setupMinutes,
    teardownMinutes: input.teardownMinutes,
    securityDepositMinor: input.securityDepositMinor ? BigInt(input.securityDepositMinor) : null,
    active: input.active,
  };
  return prisma.$transaction(async (tx) => {
    let space;
    if (input.spaceId) {
      const updated = await tx.venueSpace.updateMany({ where: { id: input.spaceId, profileId: profile.id }, data });
      if (updated.count === 0) throw new NotFoundError('Space not found');
      space = await tx.venueSpace.findUniqueOrThrow({ where: { id: input.spaceId } });
    } else {
      space = await tx.venueSpace.create({ data: { profileId: profile.id, ...data } });
    }
    await audit(tx, {
      actor,
      action: input.spaceId ? 'org.space.update' : 'org.space.create',
      targetType: 'Organization',
      targetId: input.orgId,
      data: { spaceId: space.id, name: input.name },
    });
    return space;
  });
}

export const archiveSpaceSchema = z.object({ orgId: z.string().uuid(), spaceId: z.string().uuid() });

export async function archiveSpace(actor: UserActor, input: z.infer<typeof archiveSpaceSchema>) {
  await loadAccess(actor, input.orgId, 'org.manage');
  const profile = await prisma.businessProfile.findUnique({ where: { orgId: input.orgId } });
  if (!profile) throw new NotFoundError('Space not found');
  const updated = await prisma.venueSpace.updateMany({
    where: { id: input.spaceId, profileId: profile.id, active: true },
    data: { active: false },
  });
  if (updated.count === 0) throw new NotFoundError('Space not found');
  await audit(prisma, {
    actor,
    action: 'org.space.archive',
    targetType: 'Organization',
    targetId: input.orgId,
    data: { spaceId: input.spaceId },
  });
}

export async function listSpaces(actor: UserActor, orgId: string) {
  await loadAccess(actor, orgId, 'org.view');
  const profile = await prisma.businessProfile.findUnique({ where: { orgId } });
  if (!profile) return [];
  return prisma.venueSpace.findMany({ where: { profileId: profile.id }, orderBy: { name: 'asc' } });
}

export const updateVenueSettingsSchema = z.object({
  orgId: z.string().uuid(),
  instantBook: z.boolean(),
  holdHours: z.number().int().min(1).max(720),
});

/** Instant-booking switch + hold length (P6-T08): venue-level, on the profile row. */
export async function updateVenueSettings(actor: UserActor, input: z.infer<typeof updateVenueSettingsSchema>) {
  await loadAccess(actor, input.orgId, 'org.manage');
  await requireVenue(input.orgId);
  return prisma.businessProfile.update({
    where: { orgId: input.orgId },
    data: { instantBook: input.instantBook, holdHours: input.holdHours },
  });
}

// Space photos (keys never contain file names; magic bytes verified on complete).

export const MAX_SPACE_PHOTO_BYTES = capUpload(10 * 1024 * 1024);

export const SPACE_PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

export const startSpacePhotoSchema = z.object({
  orgId: z.string().uuid(),
  spaceId: z.string().uuid(),
  mime: z.string().refine((mime) => mime in SPACE_PHOTO_TYPES, 'typeNotAllowed'),
  sizeBytes: z.number().int().min(1, 'emptyFile').max(MAX_SPACE_PHOTO_BYTES, 'tooLarge'),
});

function photoKey(orgId: string, spaceId: string, photoId: string): string {
  return `business/${orgId}/spaces/${spaceId}/${photoId}`;
}

export async function startSpacePhoto(
  storage: Storage,
  actor: UserActor,
  input: z.infer<typeof startSpacePhotoSchema>,
) {
  await loadAccess(actor, input.orgId, 'org.manage');
  const space = await prisma.venueSpace.findFirst({
    where: { id: input.spaceId, profile: { orgId: input.orgId } },
  });
  if (!space) throw new NotFoundError('Space not found');
  if (space.photoKeys.length >= 12) throw new ValidationError('Too many photos', { field: 'file', key: 'photosFull' });
  const photoId = uuidv7();
  const key = photoKey(input.orgId, input.spaceId, photoId);
  const uploadUrl = await storage.signPut(key, input.mime, input.sizeBytes);
  return { photoId, storageKey: key, uploadUrl };
}

export const completeSpacePhotoSchema = z.object({
  orgId: z.string().uuid(),
  spaceId: z.string().uuid(),
  storageKey: z.string().min(1).max(300),
});

export async function completeSpacePhoto(
  storage: Storage,
  actor: UserActor,
  input: z.infer<typeof completeSpacePhotoSchema>,
) {
  await loadAccess(actor, input.orgId, 'org.manage');
  const space = await prisma.venueSpace.findFirst({
    where: { id: input.spaceId, profile: { orgId: input.orgId } },
  });
  if (!space) throw new NotFoundError('Space not found');
  if (!input.storageKey.startsWith(`business/${input.orgId}/spaces/${input.spaceId}/`)) {
    throw new ValidationError('Photo is not from this space', { field: 'file', key: 'keyMismatch' });
  }
  const stored = await storage.head(input.storageKey);
  const sniffed = stored ? sniffMime(await storage.readStart(input.storageKey, 16)) : null;
  if (!stored || !sniffed || !(sniffed in SPACE_PHOTO_TYPES)) {
    await storage.delete(input.storageKey).catch(() => undefined);
    throw new ValidationError('File content is not a supported image', { field: 'file', key: 'contentMismatch' });
  }
  const updated = await prisma.venueSpace.update({
    where: { id: space.id },
    data: { photoKeys: [...space.photoKeys, input.storageKey] },
  });
  await audit(prisma, {
    actor,
    action: 'org.space.photo.add',
    targetType: 'Organization',
    targetId: input.orgId,
    data: { spaceId: space.id },
  });
  return updated;
}

export const removeSpacePhotoSchema = completeSpacePhotoSchema;

export async function removeSpacePhoto(
  storage: Storage,
  actor: UserActor,
  input: z.infer<typeof removeSpacePhotoSchema>,
) {
  await loadAccess(actor, input.orgId, 'org.manage');
  const space = await prisma.venueSpace.findFirst({
    where: { id: input.spaceId, profile: { orgId: input.orgId } },
  });
  if (!space || !space.photoKeys.includes(input.storageKey)) throw new NotFoundError('Photo not found');
  await prisma.venueSpace.update({
    where: { id: space.id },
    data: { photoKeys: space.photoKeys.filter((key) => key !== input.storageKey) },
  });
  await storage.delete(input.storageKey).catch(() => undefined);
}
