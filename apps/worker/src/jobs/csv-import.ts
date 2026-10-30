import { env } from '@tiwa/config';
import {
  addGuests,
  applyCsvMapping,
  createGroup,
  createLogger,
  csvMappingSchema,
  listGroups,
  type CsvMapping,
} from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { S3Storage } from '@tiwa/storage';
import { Redis } from 'ioredis';
import Papa from 'papaparse';
import { z } from 'zod';

type Log = ReturnType<typeof createLogger>;

/**
 * Backend.md §10 `guests/import`: parse the host's CSV from private storage,
 * validate, insert in chunks of 500. Progress rides the event live channel
 * (kind `guests`) — the guests page refetches counts on each notice. Max
 * 5,000 rows (UF-06-2). Idempotent per file: the file is deleted after a
 * successful import, so a re-run finds nothing and no-ops.
 */
export const GUESTS_IMPORT_TOPIC = 'guests.import' as const;
export const MAX_CSV_ROWS = 5000;
export const CSV_CHUNK = 500;

const payloadSchema = z.object({
  eventId: z.string().uuid(),
  fileKey: z.string().min(1).max(300),
  mapping: csvMappingSchema,
  // Better Auth user ids are nanoid-style, not UUIDs.
  userId: z.string().min(1).max(64),
  totalRows: z.number().int().min(1).max(MAX_CSV_ROWS),
});

export interface CsvImportResult {
  imported: number;
  warnings: number;
  groupsCreated: number;
}

const globalRedis = globalThis as unknown as { __tiwaWorkerLive?: Redis };

function live(): Redis {
  globalRedis.__tiwaWorkerLive ??= new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
  globalRedis.__tiwaWorkerLive.on('error', () => undefined);
  return globalRedis.__tiwaWorkerLive;
}

function storage(): S3Storage {
  return new S3Storage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET_PRIVATE,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  });
}

async function notify(eventId: string): Promise<void> {
  await live()
    .publish(`event:${eventId}`, JSON.stringify({ kind: 'guests', at: Date.now() }))
    .catch(() => undefined);
}

export async function handleGuestCsvImport(data: unknown, log: Log): Promise<CsvImportResult> {
  const input = payloadSchema.parse(data);
  const store = storage();
  const head = await store.head(input.fileKey).catch(() => null);
  if (!head) {
    log.info({ topic: GUESTS_IMPORT_TOPIC, eventId: input.eventId }, 'csv file gone (already imported?)');
    return { imported: 0, warnings: 0, groupsCreated: 0 };
  }
  const url = await store.getSignedUrl(input.fileKey, 600);
  const text = await (await fetch(url)).text();
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    log.info({ topic: GUESTS_IMPORT_TOPIC, errors: parsed.errors.length }, 'csv parse errors (rows kept)');
  }
  const body = parsed.data.slice(1);
  if (body.length > MAX_CSV_ROWS) throw new Error(`csv too large: ${body.length} rows (max ${MAX_CSV_ROWS})`);

  const rows = applyCsvMapping(body, input.mapping as CsvMapping);
  const actor = { kind: 'user' as const, userId: input.userId, isAdmin: false };
  const known = new Map((await listGroups(actor, input.eventId)).map((group) => [group.name.toLowerCase(), group.id]));
  let groupsCreated = 0;
  for (const name of new Set(rows.map((row) => row.group).filter((group): group is string => Boolean(group)))) {
    if (!known.has(name.toLowerCase())) {
      const created = await createGroup(actor, { eventId: input.eventId, name, color: null });
      known.set(name.toLowerCase(), created.groupId);
      groupsCreated += 1;
    }
  }

  // The host's guests.manage was checked when they enqueued the import
  // (importGuestsCsv action); the job replays it as the same actor.
  let imported = 0;
  let warnings = 0;
  for (let offset = 0; offset < rows.length; offset += CSV_CHUNK) {
    const chunk = rows.slice(offset, offset + CSV_CHUNK);
    const result = await addGuests(actor, {
      eventId: input.eventId,
      source: 'CSV',
      guests: chunk.map((row) => ({
        name: row.name,
        ...(row.phone ? { phone: row.phone } : {}),
        ...(row.email ? { email: row.email } : {}),
        groupIds: row.group && known.get(row.group.toLowerCase()) ? [known.get(row.group.toLowerCase()) as string] : [],
        ...(row.plusOnes !== undefined ? { plusOnesAllowed: Math.min(row.plusOnes, 20) } : {}),
        ...(row.meal ? { meal: row.meal } : {}),
        ...(row.dietary ? { dietary: row.dietary } : {}),
      })),
    });
    imported += result.created.length;
    warnings += result.warnings.length;
    await notify(input.eventId);
  }

  await store.delete(input.fileKey).catch(() => undefined);
  // The delete above removes the raw PII file; the guests remain.
  log.info(
    { topic: GUESTS_IMPORT_TOPIC, eventId: input.eventId, imported, warnings, groupsCreated },
    'csv import done',
  );
  await prisma.auditLog.create({
    data: {
      actorId: input.userId,
      actorType: 'user',
      action: 'guests.importCsv',
      targetType: 'Event',
      targetId: input.eventId,
      data: { imported, warnings, groupsCreated },
    },
  });
  return { imported, warnings, groupsCreated };
}
