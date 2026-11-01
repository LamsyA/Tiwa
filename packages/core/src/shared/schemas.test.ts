import { describe, expect, it } from 'vitest';
import { removeMemberSchema, updateMemberRoleSchema } from '../orgs/members.js';
import { updateTaskSchema } from '../events/tasks.js';
import { userIdSchema } from './schemas.js';

// Regression: Better Auth gave early accounts 32-char ids, and `.uuid()` on
// user ids rejected every real signed-up user (remove member, task owner, chat).
const LEGACY = '7rUQjQv2KopQoyFP6jkhkGueA8sVOp6I';
const V7 = '01a19722-26b4-7103-a049-7f19cc500677';

describe('userIdSchema', () => {
  it('accepts UUID v7 and legacy Better Auth ids', () => {
    expect(userIdSchema.safeParse(V7).success).toBe(true);
    expect(userIdSchema.safeParse(LEGACY).success).toBe(true);
  });
  it('rejects junk', () => {
    for (const bad of ['', 'x', 'has space here!!', 'a'.repeat(65), "'; drop table"]) {
      expect(userIdSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
  it('is used where real users are referenced', () => {
    expect(removeMemberSchema.safeParse({ orgId: V7, userId: LEGACY }).success).toBe(true);
    expect(updateMemberRoleSchema.safeParse({ orgId: V7, userId: LEGACY, role: 'STAFF' }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ eventId: V7, taskId: V7, ownerUserId: LEGACY }).success).toBe(true);
  });
});
