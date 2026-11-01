import { calcQuoteTotals } from '@tiwa/core';
import { describe, expect, it } from 'vitest';
import { totalsOf } from './quote-totals.js';

// P7-T13: server and client compute the same totals for 1,000 random
// quotes (UF-15-1). The web builder must show exactly what the server
// will store — any drift here breaks quotes silently.

function randomItems() {
  const count = 1 + Math.floor(Math.random() * 5);
  return Array.from({ length: count }, (_, i) => ({
    name: `item ${i}`,
    qty: 1 + Math.floor(Math.random() * 200),
    unitMinor: String(Math.floor(Math.random() * 50_000_000)),
  }));
}

describe('quote totals parity', () => {
  it('matches the server for 1,000 random quotes', () => {
    for (let i = 0; i < 1000; i += 1) {
      const items = randomItems();
      const taxBps = Math.floor(Math.random() * 20_000);
      const serviceBps = Math.floor(Math.random() * 20_000);
      const travel = String(Math.floor(Math.random() * 10_000_000));
      const server = calcQuoteTotals(items, taxBps, serviceBps, travel);
      const client = totalsOf(items, taxBps, serviceBps, travel);
      expect(client.subtotal).toBe(server.subtotalMinor);
      expect(client.total).toBe(server.totalMinor);
    }
  });
});
