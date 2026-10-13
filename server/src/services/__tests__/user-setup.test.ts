import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = {
  count: 0 as number | null,
  countError: null as Error | null,
  upsertError: null as Error | null,
  countFilters: [] as [string, unknown][],
  upserts: [] as { rows: Record<string, unknown>[]; options: Record<string, unknown> }[],
};

vi.mock('../../db/supabase.js', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== 'categories') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            db.countFilters.push([column, value]);
            return Promise.resolve({ count: db.count, error: db.countError });
          },
        }),
        upsert: (rows: Record<string, unknown>[], options: Record<string, unknown>) => {
          db.upserts.push({ rows, options });
          return Promise.resolve({ error: db.upsertError });
        },
      };
    },
  },
}));

const { ensureUserSetup, DEFAULT_CATEGORIES } = await import('../user-setup.js');

beforeEach(() => {
  db.count = 0;
  db.countError = null;
  db.upsertError = null;
  db.countFilters = [];
  db.upserts = [];
});

describe('ensureUserSetup', () => {
  it('gives a new user the default categories, owned by them', async () => {
    await ensureUserSetup('user-1');

    expect(db.countFilters).toEqual([['user_id', 'user-1']]);
    expect(db.upserts).toHaveLength(1);
    const [{ rows, options }] = db.upserts;
    expect(rows).toHaveLength(13);
    expect(rows).toEqual(DEFAULT_CATEGORIES.map(c => ({ ...c, is_default: true, user_id: 'user-1' })));
    expect(options).toEqual({ onConflict: 'user_id,name', ignoreDuplicates: true });
  });

  it('includes the baseline categories', () => {
    expect(DEFAULT_CATEGORIES.map(c => c.name)).toEqual([
      'Housing', 'Dining', 'Groceries', 'Transportation', 'Entertainment', 'Shopping', 'Utilities',
      'Subscriptions', 'Travel', 'Healthcare', 'Income', 'Investment', 'Other',
    ]);
  });

  it('leaves a user who already has categories alone', async () => {
    db.count = 4;
    await ensureUserSetup('user-1');
    expect(db.upserts).toEqual([]);
  });

  it('fails when the category count fails', async () => {
    db.countError = new Error('count failed');
    await expect(ensureUserSetup('user-1')).rejects.toThrow('count failed');
    expect(db.upserts).toEqual([]);
  });

  it('fails when seeding fails', async () => {
    db.upsertError = new Error('upsert failed');
    await expect(ensureUserSetup('user-1')).rejects.toThrow('upsert failed');
  });
});
