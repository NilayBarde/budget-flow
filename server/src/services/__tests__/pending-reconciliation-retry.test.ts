import { describe, it, expect, vi, beforeEach } from 'vitest';

// A recording fake of the supabase calls the reconciliation makes.
interface Op {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  payload?: unknown;
  filters: [string, unknown][];
}
const db = {
  ops: [] as Op[],
  pending: null as Record<string, unknown> | null,
  /** How many splits the posted row already has, for example from an interrupted earlier attempt. */
  existingSplitCount: 0,
};

const makeBuilder = (table: string) => {
  const entry: Op = { table, op: 'select', filters: [] };
  const record = (op: Op['op'], payload?: unknown) => {
    entry.op = op;
    entry.payload = payload;
    db.ops.push(entry);
    return builder;
  };
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: (payload: unknown) => record('insert', payload),
    update: (payload: unknown) => record('update', payload),
    upsert: (payload: unknown) => record('upsert', payload),
    delete: () => record('delete'),
    eq: (column: string, value: unknown) => {
      entry.filters.push([column, value]);
      return builder;
    },
    maybeSingle: async () => ({ data: db.pending, error: null }),
    then: (resolve: (value: unknown) => unknown) => {
      if (table === 'transaction_splits' && entry.op === 'select') return resolve({ data: null, count: db.existingSplitCount, error: null });
      if (table === 'transaction_tags' && entry.op === 'select') return resolve({ data: [], error: null });
      return resolve({ data: null, error: null });
    },
  };
  return builder;
};

vi.mock('../../db/supabase.js', () => ({ supabase: { from: (table: string) => makeBuilder(table) } }));

const { reconcilePendingTransaction } = await import('../pending-reconciliation.js');

const splitPending = {
  id: 'pending-row',
  amount: 40,
  category_id: 'cat-1',
  notes: null,
  merchant_display_name: null,
  merchant_name: 'Cafe',
  is_split: true,
  needs_review: false,
  splits: [
    { amount: 20, description: 'mine', is_my_share: true },
    { amount: 20, description: 'friend', is_my_share: false },
  ],
};

const opsOf = (table: string, op: Op['op']) => db.ops.filter(o => o.table === table && o.op === op);

describe('reconcilePendingTransaction', () => {
  beforeEach(() => {
    db.ops = [];
    db.pending = null;
    db.existingSplitCount = 0;
  });

  it('copies the splits onto the posted row, scaled to its total, then removes the pending row', async () => {
    db.pending = splitPending;

    expect(await reconcilePendingTransaction('posted-row', 50, 'plaid-pending')).toBe(true);

    const [insert] = opsOf('transaction_splits', 'insert');
    const rows = insert.payload as { parent_transaction_id: string; amount: number }[];
    expect(rows.map(r => r.parent_transaction_id)).toEqual(['posted-row', 'posted-row']);
    expect(rows.reduce((total, r) => total + r.amount, 0)).toBeCloseTo(50, 2);
    expect(opsOf('transactions', 'delete').map(o => o.filters)).toEqual([[['id', 'pending-row']]]);
  });

  it('does not copy the splits a second time when an interrupted attempt already did', async () => {
    // The first attempt copied the splits and stopped before deleting the pending row. The retry
    // must finish the job without leaving the posted row with doubled splits.
    db.pending = splitPending;
    db.existingSplitCount = 2;

    expect(await reconcilePendingTransaction('posted-row', 50, 'plaid-pending')).toBe(true);

    expect(opsOf('transaction_splits', 'insert')).toHaveLength(0);
    expect(opsOf('transactions', 'delete')).toHaveLength(1);
  });

  it('does nothing once the pending row is gone, so running it again is harmless', async () => {
    db.pending = null;

    expect(await reconcilePendingTransaction('posted-row', 50, 'plaid-pending')).toBe(false);

    expect(db.ops.filter(o => o.op !== 'select')).toEqual([]);
  });

  it('does nothing when the posted transaction has no pending predecessor', async () => {
    expect(await reconcilePendingTransaction('posted-row', 50, null)).toBe(false);
    expect(db.ops).toEqual([]);
  });
});
