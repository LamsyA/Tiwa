import { prisma } from '@tiwa/db';
import type { Actor } from '../auth/authorize.js';

// Outbox + audit helpers (D-A07, Backend.md §12). Call them with the same
// transaction client as the change they describe, so a rolled-back change
// leaves no job and no audit row behind.

type Tx = Pick<typeof prisma, 'outboxEvent' | 'auditLog'>;
type JsonObject = { [key: string]: string | number | boolean | null | string[] | JsonObject };

/** Record a job to publish after commit. The worker's publisher turns it into a queue job (idempotent by row id). */
export async function enqueue(tx: Tx, topic: string, payload: JsonObject): Promise<{ id: string; createdAt: Date }> {
  return tx.outboxEvent.create({ data: { topic, payload }, select: { id: true, createdAt: true } });
}

export interface AuditEntry {
  actor: Actor;
  /** `<module>.<operation>`, e.g. `org.member.invite`. */
  action: string;
  targetType: string;
  targetId: string;
  /** Ids and enums only — never names, phones, emails or addresses. */
  data?: JsonObject;
  ip?: string;
}

export async function audit(tx: Tx, entry: AuditEntry): Promise<void> {
  const actorId =
    entry.actor.kind === 'user'
      ? entry.actor.userId
      : entry.actor.kind === 'guest'
        ? (entry.actor.guestId ?? null)
        : null;
  const actorType = entry.actor.kind === 'user' ? (entry.actor.isAdmin ? 'admin' : 'user') : entry.actor.kind;
  await tx.auditLog.create({
    data: {
      actorId,
      actorType,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      ...(entry.data ? { data: entry.data } : {}),
      ...(entry.ip ? { ip: entry.ip } : {}),
    },
  });
}

export interface OutboxRow {
  id: string;
  topic: string;
  payload: unknown;
}

/**
 * Publish a batch of unpublished outbox rows (job `events/publish-outbox`).
 * Rows are locked with SKIP LOCKED so two workers never take the same row;
 * a row is marked published only after `publish` succeeds, so a crash means
 * a retry, never a lost job. `publish` must be idempotent per row id.
 */
export async function publishOutbox(publish: (row: OutboxRow) => Promise<void>, batchSize = 100): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OutboxRow[]>`
      SELECT id, topic, payload FROM "OutboxEvent"
      WHERE "publishedAt" IS NULL
      ORDER BY "createdAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED`;
    const done: string[] = [];
    for (const row of rows) {
      try {
        await publish(row);
        done.push(row.id);
      } catch {
        break; // keep order: later rows wait for this one's retry
      }
    }
    if (done.length) {
      await tx.outboxEvent.updateMany({ where: { id: { in: done } }, data: { publishedAt: new Date() } });
    }
    return done.length;
  });
}
