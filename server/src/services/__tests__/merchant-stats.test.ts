import { describe, it, expect } from 'vitest';
import {
  buildTopMerchants,
  type MerchantAggregate,
} from '../merchant-stats.js';

const m = (
  name: string,
  totalSpent: number,
  transactionCount: number,
  lastDate = '2026-04-15',
): MerchantAggregate => ({
  merchantName: name,
  totalSpent,
  transactionCount,
  lastDate,
});

describe('buildTopMerchants', () => {
  it('sorts merchants by totalSpent descending and computes avg', () => {
    const map = new Map<string, MerchantAggregate>([
      ['Whole Foods', m('Whole Foods', 600, 6)],
      ['Amazon', m('Amazon', 1200, 4)],
      ['Starbucks', m('Starbucks', 200, 20)],
    ]);

    const top = buildTopMerchants(map);

    expect(top.map(t => t.merchantName)).toEqual(['Amazon', 'Whole Foods', 'Starbucks']);
    expect(top[0].avgTransaction).toBe(300);
    expect(top[2].avgTransaction).toBe(10);
  });

  it('excludes merchants with totalSpent <= 0 (fully returned)', () => {
    const map = new Map<string, MerchantAggregate>([
      ['Refunded', m('Refunded', 0, 1)],
      ['Negative', m('Negative', -50, 1)],
      ['Real', m('Real', 100, 1)],
    ]);

    const top = buildTopMerchants(map);

    expect(top.map(t => t.merchantName)).toEqual(['Real']);
  });

  it('caps results at 10 merchants', () => {
    const map = new Map<string, MerchantAggregate>();
    for (let i = 0; i < 15; i++) {
      map.set(`Merchant ${i}`, m(`Merchant ${i}`, 1000 - i, 1));
    }

    const top = buildTopMerchants(map);

    expect(top).toHaveLength(10);
  });

  it('returns 0 avg for merchants with zero transactions (defensive)', () => {
    const map = new Map<string, MerchantAggregate>([
      ['Edge', m('Edge', 100, 0)],
    ]);

    const top = buildTopMerchants(map);

    expect(top[0].avgTransaction).toBe(0);
  });
});
