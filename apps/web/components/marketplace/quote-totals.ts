// Client-side quote totals (UF-15-1): integer maths, BigInt throughout —
// the same path the server takes (core quotes/totals). Pinned by
// quote-totals.test.ts against the server implementation.

export interface ClientQuoteItem {
  qty: number;
  unitMinor: string;
}

export function totalsOf(items: ClientQuoteItem[], taxBps: number, serviceBps: number, travelMinor: string) {
  const subtotal = items.reduce((sum, item) => sum + BigInt(item.qty || 0) * BigInt(item.unitMinor || '0'), 0n);
  const tax = (subtotal * BigInt(taxBps)) / 10_000n;
  const service = (subtotal * BigInt(serviceBps)) / 10_000n;
  return { subtotal, total: subtotal + tax + service + BigInt(travelMinor || '0') };
}
