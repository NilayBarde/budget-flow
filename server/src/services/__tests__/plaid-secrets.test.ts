import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Call {
  table: string;
  op: string;
  payload?: unknown;
  columns?: string;
  filters: [string, unknown][];
}

const db = {
  calls: [] as Call[],
  rows: [] as Record<string, unknown>[],
  error: null as Error | null,
};

vi.mock('../../db/supabase.js', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const call: Call = { table, op: '', filters: [] };
      db.calls.push(call);
      // A write returns rows only when it asked for them with .select()
      const result = () => ({ data: call.op === 'select' || call.columns ? db.rows : null, error: db.error });
      const builder = {
        select: (columns: string) => {
          if (!call.op) call.op = 'select';
          call.columns = columns;
          return builder;
        },
        update: (payload: unknown) => {
          call.op = 'update';
          call.payload = payload;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters.push([column, value]);
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) => resolve(result()),
      };
      return builder;
    },
  },
}));

const { getItemAccounts, saveCursor, itemOwner } = await import('../plaid-secrets.js');

beforeEach(() => {
  db.calls = [];
  db.rows = [];
  db.error = null;
});

describe('itemOwner', () => {
  it('is the user every account of the item belongs to', () => {
    expect(itemOwner([{ user_id: 'user-1' }, { user_id: 'user-1' }])).toBe('user-1');
  });

  it('is nobody when the accounts belong to different users', () => {
    expect(itemOwner([{ user_id: 'user-1' }, { user_id: 'user-2' }])).toBeNull();
  });

  it('is nobody when the item has no accounts', () => {
    expect(itemOwner([])).toBeNull();
  });
});

describe('getItemAccounts', () => {
  it('returns every account of a Plaid item with its owner and credentials', async () => {
    db.rows = [{ id: 'a1', user_id: 'user-1', plaid_access_token: 'access-1', plaid_cursor: 'c1' }];

    const accounts = await getItemAccounts('item-1');

    expect(accounts).toEqual(db.rows);
    expect(db.calls[0].table).toBe('accounts');
    expect(db.calls[0].filters).toEqual([['plaid_item_id', 'item-1']]);
    for (const column of ['user_id', 'plaid_access_token', 'plaid_cursor', 'plaid_account_id', 'account_type']) {
      expect(db.calls[0].columns).toContain(column);
    }
  });

  it('throws when the lookup fails', async () => {
    db.error = new Error('db down');
    await expect(getItemAccounts('item-1')).rejects.toThrow('db down');
  });
});

describe('saveCursor', () => {
  it("saves the cursor, and any status fields in the same update, on the user's accounts of the item", async () => {
    db.rows = [{ id: 'a1' }, { id: 'a2' }];

    await saveCursor('user-1', 'item-1', 'cursor-2', { last_synced_at: 'now', needs_reauth: false });

    expect(db.calls).toEqual([
      {
        table: 'accounts',
        op: 'update',
        payload: { last_synced_at: 'now', needs_reauth: false, plaid_cursor: 'cursor-2' },
        columns: 'id',
        filters: [['user_id', 'user-1'], ['plaid_item_id', 'item-1']],
      },
    ]);
  });

  it('never lets the status fields move the accounts to another user', async () => {
    db.rows = [{ id: 'a1' }];
    await saveCursor('user-1', 'item-1', 'cursor-2', { user_id: 'user-2' });
    expect(db.calls[0].payload).toEqual({ plaid_cursor: 'cursor-2' });
  });

  it('throws when no account of this user is under the item, rather than silently saving nothing', async () => {
    db.rows = [];
    await expect(saveCursor('user-1', 'item-1', 'cursor-2')).rejects.toThrow('item-1');
  });

  it('throws when the write fails, so the sync is retried from the old cursor', async () => {
    db.error = new Error('write failed');
    await expect(saveCursor('user-1', 'item-1', 'cursor-2')).rejects.toThrow('write failed');
  });
});
