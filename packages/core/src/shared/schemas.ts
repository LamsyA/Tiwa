import { z } from 'zod';

/**
 * A user id. New accounts get UUID v7 (D-A11, set in Better Auth's
 * generateId), but accounts created before that carry Better Auth's own
 * 32-character ids — so user ids are validated as opaque ids, not `.uuid()`.
 * Other entity ids (events, orgs, threads…) are always Prisma UUID v7.
 */
export const userIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'invalidId');
