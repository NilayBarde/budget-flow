import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = {
  marker: null as { value: string } | null,
  markerError: null as Error | null,
  categoryError: null as Error | null,
  markerError2: null as Error | null,
  markerFilters: [] as [string, unknown][],
  writes: [] as { table: string; rows: unknown; options: Record<string, unknown> }[],
};

vi.mock('../../db/supabase.js', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          db.markerFilters.push([column, value]);
          return builder;
        },
        maybeSingle: () => Promise.resolve({ data: db.marker, error: db.markerError }),
        upsert: (rows: unknown, options: Record<string, unknown>) => {
          db.writes.push({ table, rows, options });
          const error = table === 'categories' ? db.categoryError : db.markerError2;
          return Promise.resolve({ error });
        },
      };
      return builder;
    },
  },
}));

const { ensureUserSetup, DEFAULT_CATEGORIES, SETUP_MARKER_KEY } = await import('../user-setup.js');

beforeEach(() => {
  db.marker = null;
  db.markerError = null;
  db.categoryError = null;
  db.markerError2 = null;
  db.markerFilters = [];
  db.writes = [];
});

describe('ensureUserSetup', () => {
  it('gives a new user the default categories, then records that it did', async () => {
    await ensureUserSetup('user-1');

    expect(db.markerFilters).toEqual([['user_id', 'user-1'], ['key', SETUP_MARKER_KEY]]);
    expect(db.writes).toEqual([
      {
        table: 'categories',
        rows: DEFAULT_CATEGORIES.map(c => ({ ...c, is_default: true, user_id: 'user-1' })),
        options: { onConflict: 'user_id,name', ignoreDuplicates: true },
      },
      {
        table: 'app_settings',
        rows: { user_id: 'user-1', key: SETUP_MARKER_KEY, value: 'true' },
        options: { onConflict: 'user_id,key', ignoreDuplicates: true },
      },
    ]);
  });

  it('includes the baseline categories', () => {
    expect(DEFAULT_CATEGORIES.map(c => c.name)).toEqual([
      'Housing', 'Dining', 'Groceries', 'Transportation', 'Entertainment', 'Shopping', 'Utilities',
      'Subscriptions', 'Travel', 'Healthcare', 'Income', 'Investment', 'Other',
    ]);
  });

  it('does nothing for a user already set up, even one who has since deleted every category', async () => {
    db.marker = { value: 'true' };
    await ensureUserSetup('user-1');
    expect(db.writes).toEqual([]);
  });

  it('fails when the marker lookup fails', async () => {
    db.markerError = new Error('lookup failed');
    await expect(ensureUserSetup('user-1')).rejects.toThrow('lookup failed');
    expect(db.writes).toEqual([]);
  });

  it('does not record setup when seeding fails, so the next request retries', async () => {
    db.categoryError = new Error('seed failed');
    await expect(ensureUserSetup('user-1')).rejects.toThrow('seed failed');
    expect(db.writes.map(w => w.table)).toEqual(['categories']);
  });

  it('fails when recording the marker fails', async () => {
    db.markerError2 = new Error('marker failed');
    await expect(ensureUserSetup('user-1')).rejects.toThrow('marker failed');
  });
});
