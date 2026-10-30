import { z } from 'zod';

// CSV column mapping (UF-06 step 3). Header matching is alias-based and
// case-insensitive; the client previews headers + sample rows, the server
// suggests a mapping, the host adjusts, then the worker imports by column
// index. Group names that don't exist yet are created on import.

export const CSV_FIELDS = ['name', 'phone', 'email', 'group', 'plusOnes', 'meal', 'dietary'] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

const ALIASES: Record<CsvField, string[]> = {
  name: ['name', 'full name', 'fullname', 'guest', 'guest name'],
  phone: ['phone', 'phone number', 'telephone', 'mobile', 'tel', 'number'],
  email: ['email', 'e-mail', 'mail', 'email address'],
  group: ['group', 'groups', 'category', 'table group'],
  plusOnes: ['plus ones', 'plusones', '+1', 'companions', 'extra guests'],
  meal: ['meal', 'meal choice', 'menu'],
  dietary: ['dietary', 'dietary needs', 'diet', 'allergies', 'requirements'],
};

/** Suggest a header→field mapping (only `name` is required). */
export function suggestCsvMapping(header: string[]): Partial<Record<CsvField, number>> {
  const mapping: Partial<Record<CsvField, number>> = {};
  const used = new Set<number>();
  header.forEach((column, index) => {
    const normalised = column.trim().toLowerCase();
    for (const field of CSV_FIELDS) {
      if (mapping[field] !== undefined || used.has(index)) continue;
      if (ALIASES[field].includes(normalised)) {
        mapping[field] = index;
        used.add(index);
      }
    }
  });
  return mapping;
}

export const csvMappingSchema = z.object({
  name: z.number().int().min(0),
  phone: z.number().int().min(0).optional(),
  email: z.number().int().min(0).optional(),
  group: z.number().int().min(0).optional(),
  plusOnes: z.number().int().min(0).optional(),
  meal: z.number().int().min(0).optional(),
  dietary: z.number().int().min(0).optional(),
});

export type CsvMapping = z.infer<typeof csvMappingSchema>;

export interface MappedCsvRow {
  name: string;
  phone?: string | undefined;
  email?: string | undefined;
  group?: string | undefined;
  plusOnes?: number | undefined;
  meal?: string | undefined;
  dietary?: string | undefined;
}

/** Apply a confirmed mapping to parsed rows; skips fully-blank rows. */
export function applyCsvMapping(rows: string[][], mapping: CsvMapping): MappedCsvRow[] {
  const out: MappedCsvRow[] = [];
  for (const row of rows) {
    const cell = (index: number | undefined): string => (index === undefined ? '' : (row[index] ?? '').trim());
    const name = cell(mapping.name);
    if (!name && !cell(mapping.phone) && !cell(mapping.email)) continue;
    const plusRaw = cell(mapping.plusOnes);
    const plusOnes = plusRaw === '' ? undefined : Number.parseInt(plusRaw, 10);
    out.push({
      name,
      ...(cell(mapping.phone) ? { phone: cell(mapping.phone) } : {}),
      ...(cell(mapping.email) ? { email: cell(mapping.email) } : {}),
      ...(cell(mapping.group) ? { group: cell(mapping.group) } : {}),
      ...(plusOnes !== undefined && Number.isFinite(plusOnes) ? { plusOnes: Math.max(0, plusOnes) } : {}),
      ...(cell(mapping.meal) ? { meal: cell(mapping.meal) } : {}),
      ...(cell(mapping.dietary) ? { dietary: cell(mapping.dietary) } : {}),
    });
  }
  return out;
}
