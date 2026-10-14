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
        insert: (payload: unknown) => {
          call.op = 'insert';
          call.payload = payload;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters.push([column, value]);
          return builder;
        },
        neq: (column: string, value: unknown) => {
          call.filters.push([`${column} !=`, value]);
          return builder;
        },
        in: (column: string, value: unknown) => {
          call.filters.push([`${column} in`, value]);
          return builder;
        },
        maybeSingle: async () => ({ data: db.rows[0] ?? null, error: db.error }),
        single: async () => ({ data: db.rows[0] ?? null, error: db.error }),
        then: (resolve: (value: unknown) => unknown) => resolve(result()),
      };
      return builder;
    },
  },
}));

const {
  getItemAccounts,
  saveCursor,
  itemOwner,
  getAccountSecrets,
  updateAccountCredentials,
  insertAccount,
  findRelinkCandidates,
  plaidAccountsLinkedByOthers,
} = await import('../plaid-secrets.js');

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

  it('clears the cursor when given null', async () => {
    db.rows = [{ id: 'a1' }];
    await saveCursor('user-1', 'item-1', null);
    expect(db.calls[0].payload).toEqual({ plaid_cursor: null });
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

describe('getAccountSecrets', () => {
  it("returns the account's credentials when it belongs to the user", async () => {
    db.rows = [{ plaid_item_id: 'item-1', plaid_access_token: 'access-1', plaid_cursor: 'c1' }];

    expect(await getAccountSecrets('user-1', 'acct-1')).toEqual(db.rows[0]);
    expect(db.calls[0].filters).toEqual([['user_id', 'user-1'], ['id', 'acct-1']]);
  });

  it("is null for an account that isn't theirs (or doesn't exist)", async () => {
    expect(await getAccountSecrets('user-1', 'someone-elses')).toBeNull();
  });

  it('throws when the lookup fails', async () => {
    db.error = new Error('db down');
    await expect(getAccountSecrets('user-1', 'acct-1')).rejects.toThrow('db down');
  });
});

describe('updateAccountCredentials', () => {
  it("writes credentials and any other fields in one update, only on the user's account", async () => {
    await updateAccountCredentials(
      'user-1',
      'acct-1',
      { plaid_item_id: 'item-2', plaid_access_token: 'access-2', plaid_cursor: null },
      { relinked_at: '2026-10-12T00:00:00Z' },
    );

    expect(db.calls).toEqual([
      {
        table: 'accounts',
        op: 'update',
        payload: { relinked_at: '2026-10-12T00:00:00Z', plaid_item_id: 'item-2', plaid_access_token: 'access-2', plaid_cursor: null },
        filters: [['user_id', 'user-1'], ['id', 'acct-1']],
      },
    ]);
  });

  it('never lets the other fields move the account to another user', async () => {
    await updateAccountCredentials('user-1', 'acct-1', {}, { user_id: 'user-2', account_name: 'x' });
    expect(db.calls[0].payload).toEqual({ account_name: 'x' });
  });

  it('throws when the write fails', async () => {
    db.error = new Error('write failed');
    await expect(updateAccountCredentials('user-1', 'acct-1', { plaid_cursor: null })).rejects.toThrow('write failed');
  });
});

describe('insertAccount', () => {
  it('creates the account owned by the user and returns it without credentials', async () => {
    db.rows = [{ id: 'acct-9', user_id: 'user-1', account_name: 'Checking' }];

    const created = await insertAccount('user-1', { id: 'acct-9', plaid_access_token: 'access-1', user_id: 'user-2' });

    expect(created).toEqual(db.rows[0]);
    expect(db.calls[0].payload).toEqual({ id: 'acct-9', plaid_access_token: 'access-1', user_id: 'user-1' });
    expect(db.calls[0].columns).not.toContain('plaid_access_token');
    expect(db.calls[0].columns).not.toContain('plaid_cursor');
  });

  it('throws when the insert fails', async () => {
    db.error = new Error('insert failed');
    await expect(insertAccount('user-1', { id: 'acct-9' })).rejects.toThrow('insert failed');
  });
});

describe('findRelinkCandidates', () => {
  it("looks only at the user's accounts, by Plaid account id and by institution", async () => {
    db.rows = [{ id: 'a1', plaid_access_token: 'access-1' }];

    const rows = await findRelinkCandidates('user-1', ['p1', 'p2'], 'Chase');

    expect(db.calls.map(c => c.filters)).toEqual([
      [['user_id', 'user-1'], ['plaid_account_id in', ['p1', 'p2']]],
      [['user_id', 'user-1'], ['institution_name', 'Chase']],
    ]);
    expect(rows).toEqual([...db.rows, ...db.rows]);
  });
});

describe('plaidAccountsLinkedByOthers', () => {
  it('reports when another user already has one of these Plaid accounts', async () => {
    db.rows = [{ id: 'theirs' }];

    expect(await plaidAccountsLinkedByOthers('user-1', ['p1'])).toBe(true);
    expect(db.calls[0].filters).toEqual([['user_id !=', 'user-1'], ['plaid_account_id in', ['p1']]]);
  });

  it('is false when nobody else has them', async () => {
    expect(await plaidAccountsLinkedByOthers('user-1', ['p1'])).toBe(false);
  });

  it('is false for an empty list, without querying', async () => {
    expect(await plaidAccountsLinkedByOthers('user-1', [])).toBe(false);
    expect(db.calls).toEqual([]);
  });
});
