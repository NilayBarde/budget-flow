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
  fail: new Set<'lookup' | 'carry_fields' | 'split_count' | 'mark_split' | 'insert_splits' | 'tags_select' | 'upsert_tags' | 'delete'>(),
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
    maybeSingle: async () => (db.fail.has('lookup') ? { data: null, error } : { data: db.pending, error: null }),
    then: (resolve: (value: unknown) => unknown) => {
      if (table === 'transaction_splits' && entry.op === 'select') {
        if (db.fail.has('split_count')) return resolve({ data: null, count: null, error });
        // Honors the parent filter, so a query that forgot it would read the wrong row's count.
        const parent = entry.filters.find(([column]) => column === 'parent_transaction_id')?.[1] as string;
        return resolve({ data: null, count: db.splitCountByParent[parent] ?? 0, error: null });
      }
      if (table === 'transaction_splits' && entry.op === 'insert') return resolve({ data: null, error: db.fail.has('insert_splits') ? error : null });
      if (table === 'transactions' && entry.op === 'update') {
        // The update that marks the row as split is told apart from the one that carries fields over.
        const markingSplit = Boolean((entry.payload as { is_split?: boolean }).is_split);
        return resolve({ data: null, error: db.fail.has(markingSplit ? 'mark_split' : 'carry_fields') ? error : null });
      }
      if (table === 'transactions' && entry.op === 'delete') return resolve({ data: null, error: db.fail.has('delete') ? error : null });
      if (table === 'transaction_tags' && entry.op === 'select') {
        return resolve(db.fail.has('tags_select') ? { data: null, error } : { data: [{ tag_id: 'tag-1' }], error: null });
      }
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

  it('carries a "do not split" decision onto the posted row, so a dismissed charge does not come back when it posts', async () => {
    db.pending = { ...splitPending, is_split: false, splits: null, category_id: null, split_dismissed: true };

    await reconcilePendingTransaction('posted-row', 50, 'plaid-pending');

    const [carry] = opsOf('transactions', 'update');
    expect(carry.payload).toEqual({ split_dismissed: true });
    expect(carry.filters).toEqual([['id', 'posted-row']]);
  });

  it('does not write a dismissal when the pending row had none', async () => {
    db.pending = { ...splitPending, is_split: false, splits: null, category_id: null, split_dismissed: false };

    await reconcilePendingTransaction('posted-row', 50, 'plaid-pending');

    expect(opsOf('transactions', 'update')).toHaveLength(0);
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

    it('when the pending row cannot be looked up, which must not read as "no pending row"', async () => {
      db.pending = splitPending;
      db.fail.add('lookup');
      await expect(reconcilePendingTransaction('posted-row', 50, 'plaid-pending')).rejects.toBeTruthy();
      expect(db.ops.filter(o => o.op !== 'select')).toEqual([]);
    });

    it('when the user fields cannot be carried over', async () => {
      db.pending = splitPending;
      db.fail.add('carry_fields');
      await expectKeptAndThrown();
    });

    it('when the pending row\'s tags cannot be read', async () => {
      db.pending = splitPending;
      db.fail.add('tags_select');
      await expectKeptAndThrown();
    });

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

  it('reports a failed final delete instead of claiming success, so the retry removes the pending row', async () => {
    db.pending = splitPending;
    db.fail.add('delete');

    await expect(reconcilePendingTransaction('posted-row', 50, 'plaid-pending')).rejects.toBeTruthy();
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
