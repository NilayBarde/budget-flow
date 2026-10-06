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
  /** How many splits each posted row already has, for example from an interrupted earlier attempt. */
  splitCountByParent: {} as Record<string, number>,
  /** Calls that should fail, by name. */
  fail: new Set<'split_count' | 'mark_split' | 'insert_splits' | 'upsert_tags'>(),
};
const error = { code: 'XX000', message: 'boom' };

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
      if (table === 'transaction_splits' && entry.op === 'select') {
        if (db.fail.has('split_count')) return resolve({ data: null, count: null, error });
        // Honors the parent filter, so a query that forgot it would read the wrong row's count.
        const parent = entry.filters.find(([column]) => column === 'parent_transaction_id')?.[1] as string;
        return resolve({ data: null, count: db.splitCountByParent[parent] ?? 0, error: null });
      }
      if (table === 'transaction_splits' && entry.op === 'insert') return resolve({ data: null, error: db.fail.has('insert_splits') ? error : null });
      if (table === 'transactions' && entry.op === 'update' && (entry.payload as { is_split?: boolean }).is_split) {
        return resolve({ data: null, error: db.fail.has('mark_split') ? error : null });
      }
      if (table === 'transaction_tags' && entry.op === 'select') return resolve({ data: [{ tag_id: 'tag-1' }], error: null });
      if (table === 'transaction_tags' && entry.op === 'upsert') return resolve({ data: null, error: db.fail.has('upsert_tags') ? error : null });
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
    db.splitCountByParent = {};
    db.fail = new Set();
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
    db.splitCountByParent = { 'posted-row': 2 };

    expect(await reconcilePendingTransaction('posted-row', 50, 'plaid-pending')).toBe(true);

    expect(opsOf('transaction_splits', 'insert')).toHaveLength(0);
    expect(opsOf('transactions', 'delete')).toHaveLength(1);
  });

  it('only looks at the posted row\'s own splits, not another row\'s', async () => {
    db.pending = splitPending;
    db.splitCountByParent = { 'some-other-row': 5 };

    await reconcilePendingTransaction('posted-row', 50, 'plaid-pending');

    expect(opsOf('transaction_splits', 'insert')).toHaveLength(1);
  });

  describe('when a write fails, the pending row is kept so its edits are not lost', () => {
    const expectKeptAndThrown = async () => {
      await expect(reconcilePendingTransaction('posted-row', 50, 'plaid-pending')).rejects.toBeTruthy();
      expect(opsOf('transactions', 'delete')).toHaveLength(0);
    };

    it('when the split count cannot be read', async () => {
      db.pending = splitPending;
      db.fail.add('split_count');
      await expectKeptAndThrown();
      // It also must not guess "no splits" and copy them again.
      expect(opsOf('transaction_splits', 'insert')).toHaveLength(0);
    });

    it('when the posted row cannot be marked as split', async () => {
      db.pending = splitPending;
      db.fail.add('mark_split');
      await expectKeptAndThrown();
    });

    it('when the splits cannot be copied', async () => {
      db.pending = splitPending;
      db.fail.add('insert_splits');
      await expectKeptAndThrown();
    });

    it('when the tags cannot be copied', async () => {
      db.pending = splitPending;
      db.fail.add('upsert_tags');
      await expectKeptAndThrown();
    });
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
