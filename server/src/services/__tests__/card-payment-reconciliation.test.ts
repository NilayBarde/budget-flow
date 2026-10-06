import { describe, it, expect, vi, beforeEach } from 'vitest';

// A chainable, awaitable stand in for the supabase query builder.
const state = {
  accounts: [] as unknown[],
  transactions: [] as unknown[],
  failTransactions: false,
  updates: [] as { values: unknown; ids: string[] }[],
};

const builderFor = (table: string) => {
  let pendingUpdate: unknown = null;
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    order: chain,
    range: chain,
    gte: chain,
    update: (values: unknown) => {
      pendingUpdate = values;
      return builder;
    },
    in: (_column: string, ids: string[]) => {
      state.updates.push({ values: pendingUpdate, ids });
      return builder;
    },
    then: (resolve: (value: unknown) => unknown) => {
      if (table === 'transactions' && state.failTransactions) {
        return resolve({ data: null, error: { message: 'db down' } });
      }
      return resolve({ data: table === 'accounts' ? state.accounts : state.transactions, error: null });
    },
  });
  return builder;
};

vi.mock('../../db/supabase.js', () => ({ supabase: { from: (table: string) => builderFor(table) } }));

const { reconcileCardPayments, reconcileCardPaymentsAfterSync } = await import('../card-payment-reconciliation.js');

const tx = (overrides: Record<string, unknown>) => ({
  merchant_name: 'x',
  transaction_type: 'expense',
  type_manually_set: false,
  plaid_category: null,
  ...overrides,
});

// Any bank and any card: nothing here depends on the description.
const withBiltLikePair = () => {
  state.accounts = [
    { id: 'bank', account_type: 'checking' },
    { id: 'card', account_type: 'credit card' },
  ];
  state.transactions = [
    tx({ id: 'card-leg', account_id: 'card', amount: -2497.49, date: '2026-08-03', transaction_type: 'transfer' }),
    tx({ id: 'bank-leg', account_id: 'bank', amount: 2497.49, date: '2026-08-03', transaction_type: 'expense' }),
    tx({ id: 'groceries', account_id: 'bank', amount: 54.1, date: '2026-08-03' }),
  ];
};

describe('reconcileCardPayments', () => {
  beforeEach(() => {
    state.accounts = [];
    state.transactions = [];
    state.failTransactions = false;
    state.updates = [];
    vi.restoreAllMocks();
  });

  it('retypes the unpaired leg as a transfer with no category and leaves other rows alone', async () => {
    withBiltLikePair();

    const changed = await reconcileCardPayments();

    expect(changed.map(c => c.id)).toEqual(['bank-leg']);
    expect(changed[0].previous_type).toBe('expense');
    expect(state.updates).toEqual([
      { values: { transaction_type: 'transfer', category_id: null, needs_review: false }, ids: ['bank-leg'] },
    ]);
  });

  it('reports what would change without writing when apply is false', async () => {
    withBiltLikePair();

    const changed = await reconcileCardPayments({ apply: false });

    expect(changed.map(c => c.id)).toEqual(['bank-leg']);
    expect(state.updates).toEqual([]);
  });

  it('does not write when there is nothing to pair', async () => {
    state.accounts = [{ id: 'bank', account_type: 'checking' }];
    state.transactions = [tx({ id: 'a', account_id: 'bank', amount: 10, date: '2026-08-03' })];

    expect(await reconcileCardPayments()).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it('treats an account as a card by its type, so any institution works', async () => {
    state.accounts = [
      { id: 'b', account_type: 'savings' },
      { id: 'c', account_type: 'Credit Card' },
    ];
    state.transactions = [
      tx({ id: 'card-leg', account_id: 'c', amount: -75, date: '2026-01-10', transaction_type: 'income', merchant_name: 'Online Payment' }),
      tx({ id: 'bank-leg', account_id: 'b', amount: 75, date: '2026-01-09' }),
    ];

    const changed = await reconcileCardPayments({ sinceDate: null });

    expect(changed.map(c => c.id).sort()).toEqual(['bank-leg', 'card-leg']);
  });
});

describe('reconcileCardPaymentsAfterSync', () => {
  beforeEach(() => {
    state.updates = [];
    state.failTransactions = false;
  });

  it('never throws, so a failed cleanup cannot fail the sync that triggered it', async () => {
    state.failTransactions = true;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(reconcileCardPaymentsAfterSync()).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
  });
});
