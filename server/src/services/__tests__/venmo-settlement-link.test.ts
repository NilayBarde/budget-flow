import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = {
  transactions: [] as Record<string, unknown>[],
  splits: [] as Record<string, unknown>[],
  settlements: [] as Record<string, unknown>[],
  inserts: [] as { table: string; rows: Record<string, unknown>[] }[],
  deletes: [] as { table: string; column: string; value: unknown }[],
};

const resetState = () => {
  state.transactions = [];
  state.splits = [];
  state.settlements = [];
  state.inserts = [];
  state.deletes = [];
};

const tableData = (table: string): Record<string, unknown>[] => {
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
            if (row) Object.assign(row, values);
            return Promise.resolve({ data: null, error: null });
          },
        }),
        delete: () => ({
          eq: (col: string, val: unknown) => {
            state.deletes.push({ table, column: col, value: val });
            const remaining = tableData(table).filter((r) => r[col] !== val);
            tableData(table).length = 0;
            tableData(table).push(...remaining);
            return Promise.resolve({ data: null, error: null });
          },
        }),
        then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: filtered, error: null }),
      };
      return builder;
    },
  },
}));

const { linkVenmoSettlement, unlinkVenmoSettlement } = await import('../venmo-settlement-reconciliation.js');

describe('linkVenmoSettlement', () => {
  beforeEach(() => {
    resetState();
    state.transactions = [{ id: 'venmo-txn', amount: -25, is_venmo_settlement: false, transaction_type: 'expense' }];
    state.splits = [{ id: 'split-1', parent_transaction_id: 'dinner', amount: 25, is_my_share: false }];
  });

  it('links a split whose remaining amount matches the transaction amount', async () => {
    await linkVenmoSettlement('venmo-txn', ['split-1']);
    expect(state.settlements).toEqual([
      expect.objectContaining({ split_id: 'split-1', venmo_transaction_id: 'venmo-txn', amount: 25 }),
    ]);
    expect(state.transactions[0]).toMatchObject({ transaction_type: 'transfer', is_venmo_settlement: true });
  });

  it('rejects when the chosen splits do not sum to the transaction amount', async () => {
    state.splits = [{ id: 'split-1', parent_transaction_id: 'dinner', amount: 10, is_my_share: false }];
    await expect(linkVenmoSettlement('venmo-txn', ['split-1'])).rejects.toThrow(/amount/i);
    expect(state.settlements).toEqual([]);
  });

  it('rejects a split that is already fully settled', async () => {
    state.settlements = [{ id: 's1', split_id: 'split-1', venmo_transaction_id: 'other-txn', amount: 25 }];
    await expect(linkVenmoSettlement('venmo-txn', ['split-1'])).rejects.toThrow(/settled/i);
  });

  it('rejects linking a Venmo send (money out), even if the amount matches', async () => {
    // A split can only be settled by money arriving, never by money the user sent — otherwise a
    // real expense would get flipped to a transfer and silently drop out of spending totals.
    state.transactions = [{ id: 'venmo-txn', amount: 25, is_venmo_settlement: false, transaction_type: 'expense' }];
    await expect(linkVenmoSettlement('venmo-txn', ['split-1'])).rejects.toThrow(/incoming/i);
    expect(state.settlements).toEqual([]);
  });
});

describe('unlinkVenmoSettlement', () => {
  it('removes the settlement rows and reverts the transaction type', async () => {
    resetState();
    state.transactions = [
      { id: 'venmo-txn', amount: -25, is_venmo_settlement: true, transaction_type: 'transfer', merchant_name: 'Venmo', original_description: null, plaid_category: null },
    ];
    state.settlements = [{ id: 's1', split_id: 'split-1', venmo_transaction_id: 'venmo-txn', amount: 25 }];

    await unlinkVenmoSettlement('venmo-txn');

    expect(state.settlements).toEqual([]);
    expect(state.transactions[0]).toMatchObject({ is_venmo_settlement: false, transaction_type: 'return' });
  });
});
