import { z } from 'zod';
import { ValidationError } from '../shared/errors.js';
import { mulBps } from '../shared/money.js';

// Quote totals (QTE-02, UF-15-1): integer maths only, minor units as strings
// over the wire (BigInt can't cross JSON). tax/service are basis points on
// the subtotal; mulBps truncates toward zero so fees never over-charge.

export const quoteItemSchema = z.object({
  name: z.string().trim().min(1, 'itemNameRequired').max(200, 'itemNameTooLong'),
  qty: z.number().int().min(1, 'qtyInvalid').max(100_000, 'qtyTooLarge'),
  unitMinor: z.string().regex(/^\d+$/, 'amountInvalid'),
});

export type QuoteItem = z.infer<typeof quoteItemSchema>;

export interface QuoteTotals {
  subtotalMinor: bigint;
  taxMinor: bigint;
  serviceMinor: bigint;
  totalMinor: bigint;
}

const BPS = z.number().int().min(0, 'bpsInvalid').max(100_000, 'bpsTooLarge');

export function calcQuoteTotals(
  rawItems: unknown,
  rawTaxBps: unknown,
  rawServiceBps: unknown,
  rawTravelMinor: unknown,
): QuoteTotals {
  const items = z.array(quoteItemSchema).min(1, 'itemsRequired').parse(rawItems);
  const taxBps = BPS.parse(rawTaxBps);
  const serviceBps = BPS.parse(rawServiceBps);
  const travelMinor = typeof rawTravelMinor === 'bigint' ? rawTravelMinor : BigInt(z.string().regex(/^\d+$/).parse(rawTravelMinor));
  if (travelMinor < 0n) throw new ValidationError('Travel fee cannot be negative', { key: 'amountInvalid' });

  let subtotalMinor = 0n;
  for (const item of items) {
    subtotalMinor += BigInt(item.qty) * BigInt(item.unitMinor);
  }
  const taxMinor = mulBps(subtotalMinor, taxBps);
  const serviceMinor = mulBps(subtotalMinor, serviceBps);
  return { subtotalMinor, taxMinor, serviceMinor, totalMinor: subtotalMinor + taxMinor + serviceMinor + travelMinor };
}

/** Wire format: bigints as decimal strings so client and server share one path. */
export function totalsToStrings(totals: QuoteTotals): { subtotalMinor: string; totalMinor: string } {
  return { subtotalMinor: totals.subtotalMinor.toString(), totalMinor: totals.totalMinor.toString() };
}
