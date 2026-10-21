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
};

const resetState = () => {
  state.accounts = [];
  state.transactions = [];
  state.splits = [];
  state.settlements = [];
  state.inserts = [];
  state.updates = [];
};

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
        then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: filtered, error: null }),
      };
      return builder;
    },
  },
}));

const { reconcileVenmoSettlements, loadUnsettledSplits } = await import('../venmo-settlement-reconciliation.js');

describe('venmo-settlement-reconciliation', () => {
  beforeEach(resetState);

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
        date: '2026-08-01',
        transaction_type: 'expense',
        type_manually_set: false,
        is_venmo_settlement: false,
      },
      {
        id: 'venmo-deposit',
        account_id: 'venmo-acct',
        amount: -25,
        date: '2026-08-03',
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
      { splitId: 'split-theirs', transactionId: 'dinner-txn', date: '2026-08-01', remainingAmount: 25 },
    ]);
  });

  it('loadUnsettledSplits excludes a split already fully covered by a settlement', async () => {
    seedBasicScenario();
    state.settlements = [{ id: 's1', split_id: 'split-theirs', venmo_transaction_id: 'venmo-deposit', amount: 25 }];
    expect(await loadUnsettledSplits()).toEqual([]);
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
      date: '2026-08-03',
      transaction_type: 'return',
      type_manually_set: false,
      is_venmo_settlement: false,
    });
    const results = await reconcileVenmoSettlements({ apply: true });
    expect(results).toEqual([{ venmoTransactionId: 'venmo-deposit', splitIds: ['split-theirs'], totalAmount: 25 }]);
  });
});
