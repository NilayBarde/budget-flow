import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = {
  calls: [] as { table: string; op: string; payload?: unknown; columns?: string; filters: [string, unknown][] }[],
  rows: [] as Record<string, unknown>[],
  error: null as Error | null,
};

vi.mock('../../db/supabase.js', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const call = { table, op: '', filters: [] as [string, unknown][] } as (typeof db.calls)[number];
      db.calls.push(call);
      const builder = {
        select: (columns: string) => {
          call.op = 'select';
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
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: call.op === 'select' ? db.rows : null, error: db.error }),
      };
      return builder;
    },
  },
}));

const { getItemAccounts, saveCursor } = await import('../plaid-secrets.js');

beforeEach(() => {
  db.calls = [];
  db.rows = [];
  db.error = null;
});

describe('getItemAccounts', () => {
  it("returns every account of a Plaid item with its owner and credentials", async () => {
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
  it("saves the cursor on the item's accounts, only for that user", async () => {
    await saveCursor('user-1', 'item-1', 'cursor-2');

    expect(db.calls).toEqual([
      {
        table: 'accounts',
        op: 'update',
        payload: { plaid_cursor: 'cursor-2' },
        filters: [['user_id', 'user-1'], ['plaid_item_id', 'item-1']],
      },
    ]);
  });

  it('throws when the write fails, so the sync is retried from the old cursor', async () => {
    db.error = new Error('write failed');
    await expect(saveCursor('user-1', 'item-1', 'cursor-2')).rejects.toThrow('write failed');
  });
});
