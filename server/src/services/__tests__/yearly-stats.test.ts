import { describe, it, expect, vi } from 'vitest';

interface Row {
  id: string;
  amount: number;
  date: string;
  transaction_type: string;
  is_split: boolean;
  category: { id: string; name: string; color: string; icon: string } | null;
  splits: { amount: number; is_my_share: boolean }[] | null;
  merchant_name?: string | null;
  merchant_display_name?: string | null;
}

// A fake table that behaves like PostgREST: it returns at most 1000 rows, and only a different slice
// when .range(from, to) is used. This is the behavior that made the yearly totals wrong.
const db = { rows: [] as Row[], rangeCalls: [] as [number, number][], ordered: [] as string[] };

vi.mock('../../db/supabase.js', () => ({
  supabase: {
    from: () => {
      let range: [number, number] | null = null;
      const builder: Record<string, unknown> = {
        select: () => builder,
        gte: () => builder,
        lte: () => builder,
        order: (column: string) => {
          db.ordered.push(column);
          return builder;
        },
        range: (from: number, to: number) => {
          range = [from, to];
          db.rangeCalls.push([from, to]);
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) => {
          const [from, to] = range ?? [0, 999];
          return resolve({ data: db.rows.slice(from, Math.min(to, from + 999) + 1), error: null });
        },
      };
      return builder;
    },
  },
}));

const { buildYearlyStats, loadYearlyStats } = await import('../yearly-stats.js');

const dining = { id: 'c-dining', name: 'Dining', color: '#f00', icon: 'utensils' };
let nextId = 0;
const row = (overrides: Partial<Row>): Row => ({
  id: `row-${++nextId}`,
  amount: 10,
  date: '2026-05-10',
  transaction_type: 'expense',
  is_split: false,
  category: dining,
  splits: null,
  ...overrides,
});

describe('buildYearlyStats', () => {
  it('adds income and investments to the month they happened in', () => {
    const stats = buildYearlyStats(2026, [
      row({ amount: -1500, date: '2026-05-06', transaction_type: 'income', category: null }),
      row({ amount: -1500, date: '2026-05-20', transaction_type: 'income', category: null }),
      row({ amount: 480, date: '2026-05-08', transaction_type: 'investment', category: null }),
    ]);

    expect(stats.monthly_totals[4]).toEqual({ month: 5, spent: 0, income: 3000, invested: 480 });
    expect(stats.total_income).toBe(3000);
    expect(stats.total_invested).toBe(480);
  });

  it('counts only the user\'s share of a split expense', () => {
    const stats = buildYearlyStats(2026, [
      row({
        amount: 4640,
        is_split: true,
        splits: [{ amount: 2402.5, is_my_share: true }, { amount: 2237.5, is_my_share: false }],
      }),
    ]);

    expect(stats.monthly_totals[4].spent).toBe(2402.5);
    expect(stats.category_totals[0].amount).toBe(2402.5);
  });

  it('nets returns off the month and the category, and never goes below zero', () => {
    const stats = buildYearlyStats(2026, [
      row({ amount: 100 }),
      row({ amount: -30, transaction_type: 'return' }),
      row({ amount: -500, transaction_type: 'return', date: '2026-06-02' }),
    ]);

    expect(stats.monthly_totals[4].spent).toBe(70);
    expect(stats.monthly_totals[5].spent).toBe(0);
    expect(stats.category_totals[0].amount).toBe(0);
  });

  it('ranks merchants across the whole year, preferring the display name and netting returns', () => {
    const stats = buildYearlyStats(2026, [
      row({ amount: 2375, date: '2026-01-02', merchant_name: 'Bps*bilt Rent', merchant_display_name: 'Bilt Housing Payment' }),
      row({ amount: 1247.5, date: '2026-09-03', merchant_display_name: 'Bilt Housing Payment' }),
      row({ amount: 40, date: '2026-03-04', merchant_name: 'Trader Joe\'s' }),
      row({ amount: 25, date: '2026-03-05', merchant_name: 'Amazon' }),
      row({ amount: -25, date: '2026-03-06', transaction_type: 'return', merchant_name: 'Amazon' }),
      row({ amount: 5000, transaction_type: 'transfer', merchant_name: 'Payment' }),
    ]);

    expect(stats.top_merchants.map(m => m.merchantName)).toEqual(['Bilt Housing Payment', 'Trader Joe\'s']);
    expect(stats.top_merchants[0]).toMatchObject({ totalSpent: 3622.5, transactionCount: 2, lastDate: '2026-09-03' });
  });

  it('ignores transfers', () => {
    const stats = buildYearlyStats(2026, [row({ amount: 9999, transaction_type: 'transfer' })]);

    expect(stats.total_spent).toBe(0);
    expect(stats.total_income).toBe(0);
  });
});

describe('loadYearlyStats', () => {
  const income = (n: number, date: string): Row =>
    row({ amount: -100, date, transaction_type: 'income', category: null, is_split: false, splits: n ? null : null });

  it('counts every row of a year with more than 1,000 transactions, not just the first 1,000', async () => {
    // 1,500 filler expenses in January, then 4 paychecks in May. An unpaginated read stops at row 1,000
    // and never sees them, which is how May showed half its income.
    db.rows = [
      ...Array.from({ length: 1500 }, () => row({ amount: 1, date: '2026-01-15' })),
      income(1, '2026-05-06'), income(2, '2026-05-13'), income(3, '2026-05-20'), income(4, '2026-05-27'),
    ];
    db.rangeCalls = [];
    db.ordered = [];

    const stats = await loadYearlyStats(2026);

    expect(stats.monthly_totals[4].income).toBe(400);
    expect(stats.monthly_totals[0].spent).toBe(1500);
    expect(db.rangeCalls).toEqual([[0, 999], [1000, 1999]]);
  });

  it('counts a transaction once even if a sync shifted the pages and it came back twice', async () => {
    const filler = Array.from({ length: 999 }, () => row({ amount: 1, date: '2026-01-15' }));
    const paycheck = income(1, '2026-05-06');
    // The paycheck is the last row of page one and, after a row was inserted mid read, the first of page two.
    db.rows = [...filler, paycheck, paycheck, income(2, '2026-05-13')];

    const stats = await loadYearlyStats(2026);

    expect(stats.monthly_totals[4].income).toBe(200);
  });

  it('pages in a stable order, so no row is skipped or repeated between pages', async () => {
    db.rows = Array.from({ length: 1200 }, () => row({}));
    db.ordered = [];

    await loadYearlyStats(2026);

    expect(db.ordered.slice(0, 2)).toEqual(['date', 'id']);
  });
});
