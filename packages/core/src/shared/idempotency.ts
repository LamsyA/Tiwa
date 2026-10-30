import type { Prisma } from '@tiwa/db';

// Idempotency (Backend.md §4.4): commands that send messages (or move money)
// accept an idempotency key. First call runs and stores the response; replays
// with the same key return the stored response without re-running.

type Tx = Prisma.TransactionClient;

export async function withIdempotency<T>(
  tx: Tx,
  scope: string,
  key: string,
  run: () => Promise<T>,
): Promise<{ data: T; replayed: boolean }> {
  const id = `${scope}:${key}`;
  const existing = await tx.idempotencyKey.findUnique({ where: { key: id } });
  if (existing?.response) return { data: existing.response as T, replayed: true };
  // Reserve first so a concurrent twin blocks on the PK instead of double-running.
  try {
    await tx.idempotencyKey.create({ data: { key: id, scope } });
  } catch {
    const raced = await tx.idempotencyKey.findUnique({ where: { key: id } });
    if (raced?.response) return { data: raced.response as T, replayed: true };
    throw new Error(`idempotency key in use: ${scope}`);
  }
  const data = await run();
  // Stored responses must be JSON-safe (BigInt becomes a string) — replays return them verbatim.
  const response = JSON.parse(
    JSON.stringify(data, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)),
  );
  await tx.idempotencyKey.update({ where: { key: id }, data: { response } });
  return { data, replayed: false };
}
