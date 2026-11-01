import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Indexes created in hand-written SQL that schema.prisma can't express
// (NULLS NOT DISTINCT, gin_trgm_ops). `prisma migrate dev` doesn't know them
// and adds `DROP INDEX` for them to every new migration — which silently
// removes the double-booking guard (D-D07). Delete those lines when it does.
const PROTECTED = ['availability_unique', 'business_search_trgm'];

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations');

describe('migrations keep hand-written indexes', () => {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name, 'migration.sql'));

  it.each(PROTECTED)('no migration drops %s', (name) => {
    const offenders = files.filter((file) =>
      new RegExp(`DROP\\s+INDEX\\s+(IF\\s+EXISTS\\s+)?"?${name}"?`, 'i').test(readFileSync(file, 'utf8')),
    );
    expect(offenders.map((file) => path.basename(path.dirname(file)))).toEqual([]);
  });
});
