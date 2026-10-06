import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncResult } from '../plaid.js';
import type { MerchantMapping } from '../merchant-mappings.js';

// A recording stand in for the supabase query builder. Every operation is logged with the filters
// it ended up with, and results come from `db`, so tests can assert both what was written and when.
interface Op {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  payload?: unknown;
  filters: [string, unknown][];
}
const db = {
  ops: [] as Op[],
  categories: [{ id: 'cat-dining', name: 'Dining' }, { id: 'cat-income', name: 'Income' }, { id: 'cat-invest', name: 'Investment' }],
  existingByPlaidId: new Map<string, { id: string; account_id: string; merchant_name?: string; merchant_display_name?: string }>(),
  failInsertFor: new Set<string>(),
  /** Inserts that hit the unique constraint, because another sync stored the row first. */
  duplicateInsertFor: new Set<string>(),
  failUpdateFor: new Set<string>(),
  failDeleteFor: new Set<string>(),
  /** Make every row lookup fail like a dropped connection, instead of "no rows". */
  lookupFails: false,
};

const makeBuilder = (table: string) => {
  const entry: Op = { table, op: 'select', filters: [] };
  const plaidIdOfEntry = () =>
    (entry.payload as { plaid_transaction_id?: string } | undefined)?.plaid_transaction_id ??
    (entry.filters.find(([column]) => column === 'plaid_transaction_id')?.[1] as string | undefined);
  const result = () => {
    if (entry.op === 'select' && table === 'categories') return { data: db.categories, error: null };
    const plaidId = plaidIdOfEntry() ?? '';
    if (entry.op === 'insert') {
      if (db.duplicateInsertFor.has(plaidId)) return { data: null, error: { code: '23505', message: 'duplicate key value' } };
      return { data: null, error: db.failInsertFor.has(plaidId) ? { code: 'P0001', message: 'insert failed' } : null };
    }
    if (entry.op === 'update' && db.failUpdateFor.has(plaidId)) return { data: null, error: { code: 'P0001', message: 'update failed' } };
    if (entry.op === 'delete' && db.failDeleteFor.has(plaidId)) return { data: null, error: { code: 'P0001', message: 'delete failed' } };
    return { data: null, error: null };
  };
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: (payload: unknown) => {
      entry.op = 'insert';
      entry.payload = payload;
      db.ops.push(entry);
      return builder;
    },
    update: (payload: unknown) => {
      entry.op = 'update';
      entry.payload = payload;
      db.ops.push(entry);
      return builder;
    },
    delete: () => {
      entry.op = 'delete';
      db.ops.push(entry);
      return builder;
    },
    eq: (column: string, value: unknown) => {
      entry.filters.push([column, value]);
      return builder;
    },
    single: async () => {
      db.ops.push(entry);
      if (db.lookupFails) return { data: null, error: { code: '08006', message: 'connection failure' } };
      const plaidId = entry.filters.find(([column]) => column === 'plaid_transaction_id')?.[1] as string;
      const found = db.existingByPlaidId.get(plaidId);
      // PostgREST reports "no rows" from .single() as an error with this code.
      return found ? { data: found, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    },
    then: (resolve: (value: unknown) => unknown) => {
      if (entry.op === 'select' && !db.ops.includes(entry)) db.ops.push(entry);
      return resolve(result());
    },
  };
  return builder;
};

vi.mock('../../db/supabase.js', () => ({ supabase: { from: (table: string) => makeBuilder(table) } }));

// The helpers below are tested on their own, so here they are stubs with a recorded call.
const rules = { list: [] as MerchantMapping[], lockedIds: new Set<string>() };
vi.mock('../merchant-mappings.js', async () => {
  const actual = await vi.importActual<typeof import('../merchant-mappings.js')>('../merchant-mappings.js');
  return {
    ...actual,
    loadMerchantMappings: async () => ({
      find: (...names: (string | null | undefined)[]) =>
        rules.list.find(rule => names.some(name => name && name.toLowerCase() === rule.original_name.toLowerCase())),
    }),
    loadManuallyTypedIds: async () => rules.lockedIds,
  };
});
const reconcilePending = vi.fn(async () => false);
vi.mock('../pending-reconciliation.js', () => ({ reconcilePendingTransaction: (...args: unknown[]) => (reconcilePending as (...a: unknown[]) => unknown)(...args) }));
const reconcileCardPayments = vi.fn(async () => undefined);
vi.mock('../card-payment-reconciliation.js', () => ({
  reconcileCardPaymentsAfterSync: (...args: unknown[]) => (reconcileCardPayments as (...a: unknown[]) => unknown)(...args),
}));

const { buildNewTransactionRow, buildTransactionUpdate, applySyncResult } = await import('../sync-transactions.js');

type PlaidTx = SyncResult['added'][number];

const tx = (overrides: Partial<PlaidTx> = {}): PlaidTx => ({
  transaction_id: 't1',
  account_id: 'plaid-acct',
  amount: 12.5,
  date: '2026-10-01',
  name: 'STARBUCKS #123',
  merchant_name: 'Starbucks',
  pending: false,
  original_description: 'STARBUCKS #123 NEW YORK',
  personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' },
  ...overrides,
});

const mapping = (overrides: Partial<MerchantMapping> = {}): MerchantMapping => ({
  id: 'm1',
  original_name: 'Starbucks',
  display_name: 'My Cafe',
  default_category_id: null,
  default_transaction_type: null,
  ...overrides,
});

const categoryMap = new Map([
  ['Dining', 'cat-dining'],
  ['Income', 'cat-income'],
  ['Investment', 'cat-invest'],
]);

const newRow = (t: PlaidTx, overrides: Partial<Parameters<typeof buildNewTransactionRow>[1]> = {}) =>
  buildNewTransactionRow(t, { accountId: 'acct-1', accountType: 'checking', mapping: undefined, categoryMap, ...overrides });

describe('buildNewTransactionRow', () => {
  it('builds an expense row with the Plaid category, cleaned display name and stored Plaid category', () => {
    const row = newRow(tx());

    expect(row).toMatchObject({
      account_id: 'acct-1',
      plaid_transaction_id: 't1',
      amount: 12.5,
      date: '2026-10-01',
      merchant_name: 'Starbucks',
      original_description: 'STARBUCKS #123 NEW YORK',
      merchant_display_name: 'Starbucks',
      transaction_type: 'expense',
      category_id: 'cat-dining',
      needs_review: false,
      type_manually_set: false,
      is_split: false,
      is_recurring: false,
      pending: false,
      plaid_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' },
    });
  });

  it('lets a merchant rule set the category, display name and type, and locks the type', () => {
    const row = newRow(tx(), { mapping: mapping({ default_category_id: 'cat-custom', default_transaction_type: 'expense' }) });

    expect(row.category_id).toBe('cat-custom');
    expect(row.merchant_display_name).toBe('My Cafe');
    expect(row.type_manually_set).toBe(true);
  });

  it('leaves a row uncategorized and flags it for review when Plaid gives no usable category', () => {
    const row = newRow(tx({ personal_finance_category: undefined }));

    expect(row.category_id).toBeNull();
    expect(row.needs_review).toBe(true);
    expect(row.plaid_category).toBeNull();
  });

  it('categorizes a return like an expense', () => {
    // Refunds from a first link used to be left uncategorized while webhooks categorized them.
    const row = newRow(tx({ amount: -12.5 }));

    expect(row.transaction_type).toBe('return');
    expect(row.category_id).toBe('cat-dining');
  });

  it('gives income and investments their own categories', () => {
    // Manual sync used to skip these while webhooks and the first link assigned them.
    const income = newRow(tx({ amount: -3000, merchant_name: 'Employer', name: 'Employer', personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_WAGES' } }));
    expect(income.transaction_type).toBe('income');
    expect(income.category_id).toBe('cat-income');

    const investment = newRow(
      tx({
        amount: 500,
        merchant_name: 'Robinhood',
        name: 'Robinhood',
        original_description: 'Robinhood - Debits Withdrawal WITHDRAWAL',
        personal_finance_category: { primary: 'TRANSFER_OUT', detailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS' },
      }),
    );
    expect(investment.transaction_type).toBe('investment');
    expect(investment.category_id).toBe('cat-invest');
  });

  it('gives a transfer no category and no review flag', () => {
    const row = newRow(tx({ merchant_name: 'Zelle', name: 'Zelle payment', original_description: 'Zelle payment to Sam', personal_finance_category: undefined }));

    expect(row.transaction_type).toBe('transfer');
    expect(row.category_id).toBeNull();
    expect(row.needs_review).toBe(false);
  });

  it('types an INCOME tagged inflow on a credit card as a transfer, using the account type', () => {
    const payment = tx({
      amount: -2497.49,
      merchant_name: 'Payment - Bilt Housing',
      name: 'Payment - Bilt Housing',
      personal_finance_category: { primary: 'INCOME', detailed: 'INCOME_RENTAL' },
    });

    expect(newRow(payment, { accountType: 'credit card' }).transaction_type).toBe('transfer');
    expect(newRow(payment, { accountType: 'checking' }).transaction_type).toBe('income');
  });

  it('falls back to the transaction name when Plaid gives no merchant or original description', () => {
    const row = newRow(tx({ merchant_name: null, original_description: undefined, name: 'ACH DEBIT ACME' }));

    expect(row.merchant_name).toBe('ACH DEBIT ACME');
    expect(row.original_description).toBe('ACH DEBIT ACME');
  });

  it('finds a merchant rule keyed on the transaction name when there is no merchant name', () => {
    const row = newRow(tx({ merchant_name: null, name: 'ACH DEBIT ACME' }), {
      mapping: mapping({ original_name: 'ACH DEBIT ACME', display_name: 'Acme' }),
    });

    expect(row.merchant_display_name).toBe('Acme');
  });
});

const update = (t: PlaidTx, overrides: Partial<Parameters<typeof buildTransactionUpdate>[1]> = {}) =>
  buildTransactionUpdate(t, {
    accountId: 'acct-1',
    accountType: 'checking',
    mapping: undefined,
    typeLocked: false,
    existing: { merchant_name: 'Starbucks', merchant_display_name: 'Starbucks' },
    ...overrides,
  });

describe('buildTransactionUpdate', () => {
  it('refreshes the fields Plaid owns and re-detects the type', () => {
    const result = update(tx({ amount: 20, date: '2026-10-02', pending: true }));

    expect(result).toMatchObject({
      account_id: 'acct-1',
      amount: 20,
      date: '2026-10-02',
      merchant_name: 'Starbucks',
      original_description: 'STARBUCKS #123 NEW YORK',
      pending: true,
      transaction_type: 'expense',
    });
  });

  it('never overwrites a type the user set by hand', () => {
    expect(update(tx(), { typeLocked: true })).not.toHaveProperty('transaction_type');
  });

  it('applies a merchant rule type when the type is not locked', () => {
    expect(update(tx(), { mapping: mapping({ default_transaction_type: 'transfer' }) }).transaction_type).toBe('transfer');
  });

  it('keeps a display name the user customized', () => {
    const result = update(tx(), { existing: { merchant_name: 'Starbucks', merchant_display_name: 'Morning coffee' } });

    expect(result).not.toHaveProperty('merchant_display_name');
  });

  it('refreshes a display name that still equals the cleaned form of the merchant name', () => {
    const result = update(tx({ merchant_name: 'Starbucks #55' }), {
      existing: { merchant_name: 'Starbucks', merchant_display_name: 'Starbucks' },
    });

    expect(result.merchant_display_name).toBe('Starbucks');
  });

  it('uses the merchant rule display name when the user has not customized it', () => {
    expect(update(tx(), { mapping: mapping() }).merchant_display_name).toBe('My Cafe');
  });

  it('treats a missing existing row as not customized', () => {
    expect(update(tx(), { existing: null }).merchant_display_name).toBe('Starbucks');
  });
});

const emptySync = (overrides: Partial<SyncResult> = {}): SyncResult => ({
  added: [],
  modified: [],
  removed: [],
  nextCursor: 'cursor-2',
  hasMore: false,
  ...overrides,
});

const apply = (syncResult: SyncResult, overrides: Partial<Parameters<typeof applySyncResult>[0]> = {}) =>
  applySyncResult({
    plaidItemId: 'item-1',
    syncResult,
    resolveAccountId: (plaidAccountId: string) => (plaidAccountId === 'plaid-acct' ? 'acct-1' : undefined),
    accountTypeById: new Map([['acct-1', 'checking']]),
    ...overrides,
  });

const opsOf = (table: string, op: Op['op']) => db.ops.filter(o => o.table === table && o.op === op);
const filterValue = (o: Op, column: string) => o.filters.find(([c]) => c === column)?.[1];

describe('applySyncResult', () => {
  beforeEach(() => {
    db.ops = [];
    db.existingByPlaidId = new Map();
    db.failInsertFor = new Set();
    db.duplicateInsertFor = new Set();
    db.failUpdateFor = new Set();
    db.failDeleteFor = new Set();
    db.lookupFails = false;
    rules.list = [];
    rules.lockedIds = new Set();
    reconcilePending.mockReset().mockResolvedValue(false);
    reconcileCardPayments.mockReset().mockResolvedValue(undefined);
  });

  it('inserts each added transaction on the account its Plaid account resolves to', async () => {
    const counts = await apply(emptySync({ added: [tx({ transaction_id: 'a' }), tx({ transaction_id: 'b', amount: 40 })] }));

    const inserts = opsOf('transactions', 'insert').map(o => o.payload as Record<string, unknown>);
    expect(inserts.map(i => [i.plaid_transaction_id, i.account_id, i.category_id])).toEqual([
      ['a', 'acct-1', 'cat-dining'],
      ['b', 'acct-1', 'cat-dining'],
    ]);
    expect(inserts[0].id).toEqual(expect.any(String));
    expect(counts).toMatchObject({ added: 2, modified: 0, removed: 0, reattributed: 0, skipped: 0 });
  });

  it('does not insert a transaction twice, and moves it when it was filed under the wrong account', async () => {
    db.existingByPlaidId.set('same', { id: 'row-1', account_id: 'acct-1' });
    db.existingByPlaidId.set('moved', { id: 'row-2', account_id: 'acct-OTHER' });

    const counts = await apply(emptySync({ added: [tx({ transaction_id: 'same' }), tx({ transaction_id: 'moved' })] }));

    expect(opsOf('transactions', 'insert')).toHaveLength(0);
    const moves = opsOf('transactions', 'update');
    expect(moves).toHaveLength(1);
    expect(moves[0].payload).toEqual({ account_id: 'acct-1' });
    expect(filterValue(moves[0], 'id')).toBe('row-2');
    expect(counts).toMatchObject({ added: 0, reattributed: 1 });
  });

  it('skips a transaction whose Plaid account cannot be resolved and counts it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const counts = await apply(emptySync({ added: [tx({ transaction_id: 'x', account_id: 'unknown-plaid-acct' })] }));

    expect(opsOf('transactions', 'insert')).toHaveLength(0);
    expect(counts.skipped).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('applies merchant rules, and runs the pending reconciliation for every new row', async () => {
    rules.list = [{ id: 'm1', original_name: 'Starbucks', display_name: 'My Cafe', default_category_id: 'cat-custom', default_transaction_type: null }];
    reconcilePending.mockResolvedValueOnce(true).mockResolvedValue(false);

    const counts = await apply(emptySync({ added: [tx({ transaction_id: 'a', pending_transaction_id: 'p1' }), tx({ transaction_id: 'b' })] }));

    const insert = opsOf('transactions', 'insert')[0].payload as Record<string, unknown>;
    expect(insert.category_id).toBe('cat-custom');
    expect(insert.merchant_display_name).toBe('My Cafe');
    expect(reconcilePending).toHaveBeenCalledTimes(2);
    expect(reconcilePending).toHaveBeenCalledWith(insert.id, 12.5, 'p1');
    expect(counts.reconciled).toBe(1);
  });

  it('refreshes modified transactions by Plaid id, keeping a hand typed type', async () => {
    rules.lockedIds = new Set(['locked']);

    const counts = await apply(emptySync({ modified: [tx({ transaction_id: 'open', amount: 20 }), tx({ transaction_id: 'locked', amount: 30 })] }));

    const updates = opsOf('transactions', 'update').filter(o => filterValue(o, 'plaid_transaction_id'));
    const byId = Object.fromEntries(updates.map(o => [filterValue(o, 'plaid_transaction_id') as string, o.payload as Record<string, unknown>]));
    expect(byId.open).toMatchObject({ account_id: 'acct-1', amount: 20, transaction_type: 'expense' });
    expect(byId.locked).toMatchObject({ amount: 30 });
    expect(byId.locked).not.toHaveProperty('transaction_type');
    expect(counts.modified).toBe(2);
  });

  it('deletes removed transactions by Plaid id', async () => {
    const counts = await apply(emptySync({ removed: [{ transaction_id: 'gone-1' }, { transaction_id: 'gone-2' }] }));

    expect(opsOf('transactions', 'delete').map(o => filterValue(o, 'plaid_transaction_id'))).toEqual(['gone-1', 'gone-2']);
    expect(counts.removed).toBe(2);
  });

  describe('recording a successful sync', () => {
    const stateWrites = () => opsOf('accounts', 'update');

    it('saves the cursor on every account of the item, stamps the sync time and clears the reconnect flag', async () => {
      await apply(emptySync({ nextCursor: 'cursor-9' }));

      const [write] = stateWrites();
      expect(filterValue(write, 'plaid_item_id')).toBe('item-1');
      expect(write.payload).toMatchObject({ plaid_cursor: 'cursor-9', needs_reauth: false, reauth_detected_at: null });
      expect(Date.parse((write.payload as { last_synced_at: string }).last_synced_at)).not.toBeNaN();
    });

    it('marks the history complete only when told, and never writes false', async () => {
      await apply(emptySync());
      expect(stateWrites()).toHaveLength(1);
      expect(JSON.stringify(stateWrites().map(w => w.payload))).not.toContain('historical_sync_complete');

      db.ops = [];
      await apply(emptySync(), { historicalComplete: true });
      expect(stateWrites().map(w => w.payload)).toContainEqual({ historical_sync_complete: true });
    });

    it('runs after every transaction is saved, and the card payment pairing after that', async () => {
      await apply(emptySync({ added: [tx()], removed: [{ transaction_id: 'gone' }] }));

      const order = db.ops.map(o => `${o.table}:${o.op}`).filter(step => step !== 'categories:select' && step !== 'transactions:select');
      expect(order).toEqual(['transactions:insert', 'transactions:delete', 'accounts:update']);
      expect(reconcileCardPayments).toHaveBeenCalledTimes(1);
    });

    it('passes the pairing look back through, so a first link can scan its whole history', async () => {
      await apply(emptySync(), { reconcileSinceDate: null });

      expect(reconcileCardPayments).toHaveBeenCalledWith({ sinceDate: null });
    });
  });

  it('passes no look back by default, so the pairing uses its own short window', async () => {
    await apply(emptySync());

    expect(reconcileCardPayments).toHaveBeenCalledWith({});
  });

  describe('when a save fails', () => {
    let error: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      error = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('finishes the rest of the batch, then throws without advancing the cursor', async () => {
      db.failInsertFor = new Set(['bad']);

      await expect(
        apply(emptySync({ added: [tx({ transaction_id: 'bad' }), tx({ transaction_id: 'good' })] })),
      ).rejects.toThrow(/1 transaction/);

      // The good row was still attempted, but the cursor was not saved, so the next sync retries.
      expect(opsOf('transactions', 'insert')).toHaveLength(2);
      expect(opsOf('accounts', 'update')).toHaveLength(0);
      expect(reconcileCardPayments).not.toHaveBeenCalled();
    });

    it('does not reconcile a pending row for a transaction that failed to save', async () => {
      db.failInsertFor = new Set(['bad']);

      await expect(apply(emptySync({ added: [tx({ transaction_id: 'bad', pending_transaction_id: 'p1' })] }))).rejects.toThrow();

      expect(reconcilePending).not.toHaveBeenCalled();
    });

    it('logs which transaction failed and the error code, so a stuck row can be found', async () => {
      db.failInsertFor = new Set(['bad']);

      await expect(apply(emptySync({ added: [tx({ transaction_id: 'bad' })] }))).rejects.toThrow();

      const logged = JSON.stringify(error.mock.calls);
      expect(logged).toContain('bad');
      expect(logged).toContain('insert failed');
    });

    it('does not advance the cursor when a modified row or a removed row fails either', async () => {
      db.failUpdateFor = new Set(['m1']);
      await expect(apply(emptySync({ modified: [tx({ transaction_id: 'm1' })] }))).rejects.toThrow(/1 transaction/);
      expect(opsOf('accounts', 'update')).toHaveLength(0);

      db.ops = [];
      db.failDeleteFor = new Set(['r1']);
      await expect(apply(emptySync({ removed: [{ transaction_id: 'r1' }] }))).rejects.toThrow(/1 transaction/);
      expect(opsOf('accounts', 'update')).toHaveLength(0);
    });

    it('counts a pending reconciliation that throws as one failure instead of aborting the batch', async () => {
      reconcilePending.mockRejectedValueOnce(new Error('splits could not be copied'));

      // The first row's reconciliation throws; the second row must still be saved.
      await expect(
        apply(emptySync({ added: [tx({ transaction_id: 'a', pending_transaction_id: 'p1' }), tx({ transaction_id: 'b' })] })),
      ).rejects.toThrow(/1 transaction/);

      expect(opsOf('transactions', 'insert')).toHaveLength(2);
      expect(opsOf('accounts', 'update')).toHaveLength(0);
    });

    it('does the same when the reconciliation of an already stored row throws', async () => {
      db.existingByPlaidId.set('posted', { id: 'row-9', account_id: 'acct-1' });
      reconcilePending.mockRejectedValueOnce(new Error('tags could not be copied'));

      await expect(
        apply(emptySync({ added: [tx({ transaction_id: 'posted', pending_transaction_id: 'p9' })] })),
      ).rejects.toThrow(/1 transaction/);

      expect(opsOf('accounts', 'update')).toHaveLength(0);
    });

    it('counts only the rows that really saved', async () => {
      db.failDeleteFor = new Set(['r1']);

      await expect(apply(emptySync({ removed: [{ transaction_id: 'r1' }, { transaction_id: 'r2' }] }))).rejects.toThrow();

      // Both deletes were attempted; the second one went through.
      expect(opsOf('transactions', 'delete')).toHaveLength(2);
    });
  });

  describe('when two syncs race on the same transaction', () => {
    it('treats a duplicate key error as already stored, not a failure', async () => {
      // Another sync (a webhook, or a manual one) inserted this row between our check and our insert.
      db.duplicateInsertFor = new Set(['raced']);

      const counts = await apply(emptySync({ added: [tx({ transaction_id: 'raced', pending_transaction_id: 'p1' }), tx({ transaction_id: 'other' })] }));

      expect(counts.added).toBe(1);
      // The sync still succeeds and records its cursor.
      expect(opsOf('accounts', 'update')).toHaveLength(1);
      // The other sync owns that row, so this one does not reconcile its pending predecessor.
      expect(reconcilePending).toHaveBeenCalledTimes(1);
    });
  });

  describe('when a lookup of a stored row fails', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('does not treat a database error as "not stored" and insert, since the row may exist', async () => {
      db.lookupFails = true;

      await expect(apply(emptySync({ added: [tx({ transaction_id: 'a' })] }))).rejects.toThrow(/1 transaction/);

      expect(opsOf('transactions', 'insert')).toHaveLength(0);
      expect(opsOf('accounts', 'update')).toHaveLength(0);
    });

    it('does not overwrite a customized display name when the stored row could not be read', async () => {
      db.lookupFails = true;

      await expect(apply(emptySync({ modified: [tx({ transaction_id: 'm1' })] }))).rejects.toThrow(/1 transaction/);

      expect(opsOf('transactions', 'update')).toHaveLength(0);
    });

    it('still inserts when the lookup simply finds no rows', async () => {
      // The fake reports PGRST116, the error PostgREST uses for "no rows".
      await apply(emptySync({ added: [tx({ transaction_id: 'new' })] }));

      expect(opsOf('transactions', 'insert')).toHaveLength(1);
    });
  });

  describe('when a retry meets a row that is already stored', () => {
    it('still reconciles its pending predecessor, which an interrupted earlier attempt may have left behind', async () => {
      db.existingByPlaidId.set('posted', { id: 'row-9', account_id: 'acct-1' });

      const counts = await apply(emptySync({ added: [tx({ transaction_id: 'posted', pending_transaction_id: 'p9' })] }));

      expect(opsOf('transactions', 'insert')).toHaveLength(0);
      expect(reconcilePending).toHaveBeenCalledWith('row-9', 12.5, 'p9');
      expect(counts.added).toBe(0);
    });

    it('does not look for a pending predecessor when the stored row has none', async () => {
      db.existingByPlaidId.set('posted', { id: 'row-9', account_id: 'acct-1' });

      await apply(emptySync({ added: [tx({ transaction_id: 'posted' })] }));

      expect(reconcilePending).not.toHaveBeenCalled();
    });
  });
});
