import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = {
  updates: [] as { table: string; payload: Record<string, unknown>; filters: [string, unknown][] }[],
  failUpdate: false,
};

vi.mock('../../db/supabase.js', () => ({
  supabase: {
    from: (table: string) => {
      const entry = { table, payload: {} as Record<string, unknown>, filters: [] as [string, unknown][] };
      const builder = {
        update: (payload: Record<string, unknown>) => {
          entry.payload = payload;
          db.updates.push(entry);
          return builder;
        },
        eq: (column: string, value: unknown) => {
          entry.filters.push([column, value]);
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: null, error: db.failUpdate ? { code: 'XX000', message: 'boom', details: null, hint: null } : null }),
      };
      return builder;
    },
  },
}));

const { describeSyncError, recordSyncFailure, SYNC_ERROR_MAX_LENGTH } = await import('../sync-error.js');

// The shape of a Plaid failure: an axios error that carries the whole request, secret included.
const plaidError = (errorCode: string, message: string) => ({
  isAxiosError: true,
  message: 'Request failed with status code 400',
  config: { headers: { 'PLAID-SECRET': 'super-secret-value', 'PLAID-CLIENT-ID': 'client-id-value' } },
  response: { data: { error_code: errorCode, error_message: message } },
});

describe('describeSyncError', () => {
  it('reads a Plaid failure as its code and message', () => {
    expect(describeSyncError(plaidError('ITEM_LOGIN_REQUIRED', 'the login details of this item have changed'))).toBe(
      'ITEM_LOGIN_REQUIRED: the login details of this item have changed',
    );
  });

  it('never includes the credentials an axios error carries', () => {
    const text = describeSyncError(plaidError('RATE_LIMIT', 'too many requests'));

    expect(text).not.toContain('super-secret-value');
    expect(text).not.toContain('client-id-value');
  });

  it('reads a database failure as its code and message, without the failing row', () => {
    const text = describeSyncError({
      code: '23505',
      message: 'duplicate key value',
      details: 'Failing row contains (plaid_access_token=access-secret)',
      hint: null,
    });

    expect(text).toBe('23505: duplicate key value');
    expect(text).not.toContain('access-secret');
  });

  it('uses the message of an ordinary error', () => {
    expect(describeSyncError(new Error('Failed to save 2 transaction(s).'))).toBe('Failed to save 2 transaction(s).');
  });

  it('falls back to a generic message when there is nothing to read', () => {
    expect(describeSyncError(undefined)).toBe('Sync failed');
    expect(describeSyncError(new Error(''))).toBe('Sync failed');
  });

  it('keeps the stored text short', () => {
    const text = describeSyncError(new Error('x'.repeat(5000)));

    expect(text.length).toBeLessThanOrEqual(SYNC_ERROR_MAX_LENGTH);
  });
});

describe('recordSyncFailure', () => {
  beforeEach(() => {
    db.updates = [];
    db.failUpdate = false;
  });

  it('stores the reason and the time on every account of the item', async () => {
    await recordSyncFailure('item-1', new Error('Failed to save 1 transaction(s).'));

    expect(db.updates).toHaveLength(1);
    const [update] = db.updates;
    expect(update.table).toBe('accounts');
    expect(update.filters).toEqual([['plaid_item_id', 'item-1']]);
    expect(update.payload.last_sync_error).toBe('Failed to save 1 transaction(s).');
    expect(new Date(update.payload.last_sync_error_at as string).getTime()).not.toBeNaN();
  });

  it('does not throw when the write itself fails, so it cannot hide the sync error it reports', async () => {
    db.failUpdate = true;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(recordSyncFailure('item-1', new Error('original'))).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('does nothing when the item is unknown', async () => {
    await recordSyncFailure(null, new Error('original'));

    expect(db.updates).toEqual([]);
  });
});
