import { describe, it, expect, vi, beforeEach } from 'vitest';

// A minimal chainable stand-in for the Supabase query builder, tracking inserts/updates by table
// so assertions can check exactly what was written without a real database.
const state = {
  accounts: [] as { id: string; institution_name: string | null; account_name: string | null }[],
  transactions: [] as Record<string, unknown>[],
  splits: [] as Record<string, unknown>[],
  settlements: [] as Record<string, unknown>[],
  inserts: [] as { table: string; rows: Record<string, unknown>[] }[],
  updates: [] as { table: string; values: Record<string, unknown>; id: string }[],
  gteCalls: [] as { table: string; col: string; val: string }[],
  rangeCalls: [] as { table: string; from: number; to: number }[],
};

const resetState = () => {
  state.accounts = [];
  state.transactions = [];
  state.splits = [];
  state.settlements = [];
  state.inserts = [];
  state.updates = [];
  state.gteCalls = [];
  state.rangeCalls = [];
};

// The real PostgREST default: a SELECT returns at most this many rows, without saying so.
const SUPABASE_ROW_CAP = 1000;

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const tableData = (table: string): Record<string, unknown>[] => {
  if (table === 'accounts') return state.accounts;
  if (table === 'transactions') return state.transactions;
  if (table === 'transaction_splits') return state.splits;
  if (table === 'transaction_split_settlements') return state.settlements;
  throw new Error(`unexpected table ${table}`);
};

vi.mock('../../db/supabase.js', () => ({
  supabase: {
    from: (table: string) => {
      let filtered = [...tableData(table)];
      const orders: { col: string; ascending: boolean }[] = [];
      let range: [number, number] | null = null;
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          filtered = filtered.filter((r) => vals.includes(r[col]));
          return builder;
        },
        gte: (col: string, val: string) => {
          state.gteCalls.push({ table, col, val });
          filtered = filtered.filter((r) => (r[col] as string) >= val);
          return builder;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          orders.push({ col, ascending: opts?.ascending ?? true });
          return builder;
        },
        // Like the real client, a page is cut from the filtered, ordered rows, and a query with no
        // .range is silently capped at 1000 rows — so a loader that forgets to page loses rows here
        // exactly as it would in production.
        range: (from: number, to: number) => {
          state.rangeCalls.push({ table, from, to });
          range = [from, to];
          return builder;
        },
        insert: (rows: Record<string, unknown>[]) => {
          state.inserts.push({ table, rows });
          tableData(table).push(...rows);
          return Promise.resolve({ data: rows, error: null });
        },
        update: (values: Record<string, unknown>) => ({
          eq: (col: string, val: unknown) => {
            const row = tableData(table).find((r) => r[col] === val);
            if (row) {
              Object.assign(row, values);
              state.updates.push({ table, values, id: val as string });
            }
            return Promise.resolve({ data: null, error: null });
          },
        }),
        then: (resolve: (v: { data: unknown; error: null }) => void) => {
          let rows = [...filtered];
          if (orders.length > 0) {
            rows.sort((a, b) => {
              for (const { col, ascending } of orders) {
                const av = a[col] as string;
                const bv = b[col] as string;
                if (av !== bv) return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
              }
              return 0;
            });
          }
          rows = range ? rows.slice(range[0], range[1] + 1) : rows.slice(0, SUPABASE_ROW_CAP);
          return resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  },
}));

const { reconcileVenmoSettlements, loadUnsettledSplits } = await import('../venmo-settlement-reconciliation.js');

describe('venmo-settlement-reconciliation', () => {
  beforeEach(resetState);

  // Relative to today so the default lookback windows always include them.
  const DINNER_DATE = daysAgo(10);
  const DEPOSIT_DATE = daysAgo(8);

  const seedBasicScenario = () => {
    state.accounts = [
      { id: 'venmo-acct', institution_name: 'Venmo', account_name: null },
      { id: 'bank-acct', institution_name: 'Chase', account_name: 'Checking' },
    ];
    state.transactions = [
      {
        id: 'dinner-txn',
        account_id: 'bank-acct',
        amount: 50,
        date: DINNER_DATE,
        transaction_type: 'expense',
        type_manually_set: false,
        is_venmo_settlement: false,
      },
      {
        id: 'venmo-deposit',
        account_id: 'venmo-acct',
        amount: -25,
        date: DEPOSIT_DATE,
        transaction_type: 'transfer',
        type_manually_set: false,
        is_venmo_settlement: false,
      },
    ];
    state.splits = [
      { id: 'split-mine', parent_transaction_id: 'dinner-txn', amount: 25, is_my_share: true },
      { id: 'split-theirs', parent_transaction_id: 'dinner-txn', amount: 25, is_my_share: false },
    ];
  };

  it('loadUnsettledSplits returns only the others-owe-me split, not my own share', async () => {
    seedBasicScenario();
    const unsettled = await loadUnsettledSplits();
    expect(unsettled).toEqual([
      { splitId: 'split-theirs', transactionId: 'dinner-txn', date: DINNER_DATE, remainingAmount: 25 },
    ]);
  });

  it('loadUnsettledSplits excludes a split already fully covered by a settlement', async () => {
    seedBasicScenario();
    state.settlements = [{ id: 's1', split_id: 'split-theirs', venmo_transaction_id: 'venmo-deposit', amount: 25 }];
    expect(await loadUnsettledSplits()).toEqual([]);
  });

  it('loadUnsettledSplits leaves out splits older than the lookback window, and lists the rest newest first', async () => {
    state.transactions = [
      { id: 'ancient', account_id: 'bank-acct', amount: 40, date: daysAgo(400) },
      { id: 'older', account_id: 'bank-acct', amount: 40, date: daysAgo(30) },
      { id: 'newer', account_id: 'bank-acct', amount: 40, date: daysAgo(2) },
    ];
    // Inserted oldest-first, so a loader that does not sort returns them in the wrong order.
    state.splits = [
      { id: 'split-ancient', parent_transaction_id: 'ancient', amount: 20, is_my_share: false },
      { id: 'split-older', parent_transaction_id: 'older', amount: 20, is_my_share: false },
      { id: 'split-newer', parent_transaction_id: 'newer', amount: 20, is_my_share: false },
    ];

    const unsettled = await loadUnsettledSplits();

    expect(unsettled.map((s) => s.splitId)).toEqual(['split-newer', 'split-older']);
    // null still reaches all the way back, for a deliberate full-history dry run.
    expect((await loadUnsettledSplits(null)).map((s) => s.splitId)).toEqual(['split-newer', 'split-older', 'split-ancient']);
  });

  it('matches and applies: inserts a settlement row and retypes the Venmo transaction', async () => {
    seedBasicScenario();
    const results = await reconcileVenmoSettlements({ apply: true });

    expect(results).toEqual([{ venmoTransactionId: 'venmo-deposit', splitIds: ['split-theirs'], totalAmount: 25 }]);
    expect(state.settlements).toEqual([
      expect.objectContaining({ split_id: 'split-theirs', venmo_transaction_id: 'venmo-deposit', amount: 25 }),
    ]);
    const venmoTxn = state.transactions.find((t) => t.id === 'venmo-deposit');
    expect(venmoTxn).toMatchObject({ transaction_type: 'transfer', is_venmo_settlement: true });
  });

  it('dry run (apply: false) reports the match without writing anything', async () => {
    seedBasicScenario();
    const results = await reconcileVenmoSettlements({ apply: false });

    expect(results).toEqual([{ venmoTransactionId: 'venmo-deposit', splitIds: ['split-theirs'], totalAmount: 25 }]);
    expect(state.settlements).toEqual([]);
    expect(state.transactions.find((t) => t.id === 'venmo-deposit')).toMatchObject({ is_venmo_settlement: false });
  });

  it('is idempotent: re-running after applying finds nothing left to match', async () => {
    seedBasicScenario();
    await reconcileVenmoSettlements({ apply: true });
    const second = await reconcileVenmoSettlements({ apply: true });
    expect(second).toEqual([]);
  });

  it('never touches a Venmo transaction whose type was manually set', async () => {
    seedBasicScenario();
    state.transactions.find((t) => t.id === 'venmo-deposit')!.type_manually_set = true;
    const results = await reconcileVenmoSettlements({ apply: true });
    expect(results).toEqual([]);
    expect(state.settlements).toEqual([]);
  });

  it('ignores transactions on non-Venmo accounts entirely', async () => {
    seedBasicScenario();
    // Same shape as the real Venmo deposit, but sitting on the bank account instead.
    state.transactions.push({
      id: 'bank-deposit',
      account_id: 'bank-acct',
      amount: -25,
      date: DEPOSIT_DATE,
      transaction_type: 'return',
      type_manually_set: false,
      is_venmo_settlement: false,
    });
    const results = await reconcileVenmoSettlements({ apply: true });
    expect(results).toEqual([{ venmoTransactionId: 'venmo-deposit', splitIds: ['split-theirs'], totalAmount: 25 }]);
  });

  describe('reading candidates past the 1000-row page cap', () => {
    it('filters Venmo transactions by date in the query itself', async () => {
      seedBasicScenario();
      const sinceDate = daysAgo(30);
      await reconcileVenmoSettlements({ apply: false, sinceDate });
      expect(state.gteCalls).toContainEqual({ table: 'transactions', col: 'date', val: sinceDate });
    });

    it('applies no date filter when sinceDate is null', async () => {
      seedBasicScenario();
      await reconcileVenmoSettlements({ apply: false, sinceDate: null });
      expect(state.gteCalls).toEqual([]);
    });

    it('still finds a matching Venmo deposit that sits beyond the first page', async () => {
      seedBasicScenario();
      // 1,050 newer, unrelated Venmo payments push the real deposit (the oldest) onto page two.
      const deposit = state.transactions.find((t) => t.id === 'venmo-deposit')!;
      state.transactions = state.transactions.filter((t) => t !== deposit);
      for (let i = 0; i < 1050; i++) {
        state.transactions.push({
          id: `noise-${String(i).padStart(4, '0')}`,
          account_id: 'venmo-acct',
          amount: 7.77,
          date: daysAgo(1),
          transaction_type: 'expense',
          type_manually_set: false,
          is_venmo_settlement: false,
        });
      }
      state.transactions.push(deposit);

      const results = await reconcileVenmoSettlements({ apply: false });

      expect(results).toEqual([{ venmoTransactionId: 'venmo-deposit', splitIds: ['split-theirs'], totalAmount: 25 }]);
      expect(state.rangeCalls.filter((c) => c.table === 'transactions').map((c) => c.from)).toEqual([0, 1000]);
    });

    it('loads every unsettled split, not just the first 1000', async () => {
      state.transactions = [{ id: 'party', account_id: 'bank-acct', amount: 2100, date: daysAgo(5) }];
      state.splits = Array.from({ length: 1050 }, (_, i) => ({
        id: `split-${String(i).padStart(4, '0')}`,
        parent_transaction_id: 'party',
        amount: 2,
        is_my_share: false,
      }));

      const unsettled = await loadUnsettledSplits();

      expect(unsettled).toHaveLength(1050);
      expect(state.rangeCalls.filter((c) => c.table === 'transaction_splits').map((c) => c.from)).toEqual([0, 1000]);
    });
  });
});
