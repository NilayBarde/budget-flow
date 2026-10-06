import { describe, it, expect, vi, beforeEach } from 'vitest';

// A chainable, awaitable stand in for the supabase query builder that records what was asked.
const state = {
  accounts: [] as unknown[],
  transactions: [] as unknown[],
  mappings: [] as unknown[],
  failTransactions: false,
  updates: [] as { values: unknown; ids: string[]; guards: unknown[][] }[],
  gteCalls: [] as unknown[][],
  orderCalls: [] as unknown[][],
  eqCalls: [] as unknown[][],
};

const builderFor = (table: string) => {
  let pendingUpdate: { values: unknown; ids: string[]; guards: unknown[][] } | null = null;
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    range: chain,
    order: (...args: unknown[]) => {
      state.orderCalls.push(args);
      return builder;
    },
    gte: (...args: unknown[]) => {
      state.gteCalls.push(args);
      return builder;
    },
    update: (values: unknown) => {
      pendingUpdate = { values, ids: [], guards: [] };
      state.updates.push(pendingUpdate);
      return builder;
    },
    in: (_column: string, ids: string[]) => {
      if (pendingUpdate) pendingUpdate.ids = ids;
      return builder;
    },
    or: (...args: unknown[]) => {
      pendingUpdate?.guards.push(['or', ...args]);
      return builder;
    },
    neq: (...args: unknown[]) => {
      pendingUpdate?.guards.push(['neq', ...args]);
      return builder;
    },
    eq: (...args: unknown[]) => {
      if (pendingUpdate) pendingUpdate.guards.push(['eq', ...args]);
      else state.eqCalls.push(args);
      return builder;
    },
    then: (resolve: (value: unknown) => unknown) => {
      if (table === 'transactions' && state.failTransactions) {
        return resolve({ data: null, error: { message: 'db down' } });
      }
      const data = table === 'accounts' ? state.accounts : table === 'merchant_mappings' ? state.mappings : state.transactions;
      return resolve({ data, error: null });
    },
  });
  return builder;
};

vi.mock('../../db/supabase.js', () => ({ supabase: { from: (table: string) => builderFor(table) } }));

const { reconcileCardPayments, reconcileCardPaymentsAfterSync, retypeInvestmentsReadingAsCardBills } =
  await import('../card-payment-reconciliation.js');

const tx = (overrides: Record<string, unknown>) => ({
  merchant_name: 'x',
  original_description: null,
  transaction_type: 'expense',
  type_manually_set: false,
  plaid_category: null,
  ...overrides,
});

const today = () => new Date().toISOString().slice(0, 10);

// Any bank and any card: a payment on the card and the matching withdrawal at the bank.
const withPaymentPair = () => {
  state.accounts = [
    { id: 'bank', account_type: 'checking', institution_name: 'Wealthfront', account_name: 'Cash' },
    { id: 'card', account_type: 'credit card', institution_name: 'Acme Rewards', account_name: 'Acme Blue Card' },
  ];
  state.transactions = [
    tx({ id: 'card-leg', account_id: 'card', amount: -2497.49, date: today(), transaction_type: 'transfer', merchant_name: 'Payment - Acme Rent' }),
    tx({ id: 'bank-leg', account_id: 'bank', amount: 2497.49, date: today(), merchant_name: 'Acme Card - Rent Withdrawal' }),
    tx({ id: 'groceries', account_id: 'bank', amount: 54.1, date: today(), merchant_name: 'Market' }),
  ];
};

describe('reconcileCardPayments', () => {
  beforeEach(() => {
    state.accounts = [];
    state.transactions = [];
    state.failTransactions = false;
    state.updates = [];
    state.gteCalls = [];
    state.orderCalls = [];
    vi.restoreAllMocks();
  });

  it('retypes the unpaired leg as a transfer with no category and leaves other rows alone', async () => {
    withPaymentPair();

    const changed = await reconcileCardPayments();

    expect(changed.map(c => c.id)).toEqual(['bank-leg']);
    expect(changed[0].previous_type).toBe('expense');
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].values).toEqual({ transaction_type: 'transfer', category_id: null, needs_review: false });
    expect(state.updates[0].ids).toEqual(['bank-leg']);
  });

  it('re-checks at write time so a row typed by hand, or already a transfer or investment, is never overwritten', async () => {
    withPaymentPair();

    await reconcileCardPayments();

    expect(state.updates[0].guards).toEqual([
      ['or', 'type_manually_set.is.null,type_manually_set.eq.false'],
      ['neq', 'transaction_type', 'transfer'],
      ['neq', 'transaction_type', 'investment'],
    ]);
  });

  it('reports what would change without writing when apply is false', async () => {
    withPaymentPair();

    const changed = await reconcileCardPayments({ apply: false });

    expect(changed.map(c => c.id)).toEqual(['bank-leg']);
    expect(state.updates).toEqual([]);
  });

  it('does not write when there is nothing to pair', async () => {
    state.accounts = [{ id: 'bank', account_type: 'checking' }];
    state.transactions = [tx({ id: 'a', account_id: 'bank', amount: 10, date: today() })];

    expect(await reconcileCardPayments()).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it('works for any institution, using the account types and the names on the rows', async () => {
    state.accounts = [
      { id: 'b', account_type: 'savings', institution_name: 'Some Credit Union', account_name: 'Savings' },
      { id: 'c', account_type: 'Credit Card', institution_name: 'Zephyr Bank', account_name: 'Zephyr Visa' },
    ];
    state.transactions = [
      tx({ id: 'card-leg', account_id: 'c', amount: -75, date: today(), transaction_type: 'income', merchant_name: 'Online Payment' }),
      tx({ id: 'bank-leg', account_id: 'b', amount: 75, date: today(), merchant_name: 'ZEPHYR CARD PMT' }),
    ];

    const changed = await reconcileCardPayments({ sinceDate: null });

    expect(changed.map(c => c.id).sort()).toEqual(['bank-leg', 'card-leg']);
  });

  it('does not use a brokerage account as the funding side', async () => {
    state.accounts = [
      { id: 'broker', account_type: 'brokerage', institution_name: 'Acme', account_name: 'Individual' },
      { id: 'card', account_type: 'credit card', institution_name: 'Acme', account_name: 'Acme Card' },
    ];
    state.transactions = [
      tx({ id: 'card-leg', account_id: 'card', amount: -40, date: today(), transaction_type: 'transfer', merchant_name: 'Payment' }),
      tx({ id: 'purchase', account_id: 'broker', amount: 40, date: today(), merchant_name: 'Acme Store' }),
    ];

    expect(await reconcileCardPayments()).toEqual([]);
  });

  it('counts a row returned twice across pages only once', async () => {
    withPaymentPair();
    state.transactions = [...(state.transactions as unknown[]), (state.transactions as unknown[])[1]];

    const changed = await reconcileCardPayments();

    expect(changed.map(c => c.id)).toEqual(['bank-leg']);
  });

  it('orders by id after date so pagination is stable', async () => {
    withPaymentPair();

    await reconcileCardPayments();

    expect(state.orderCalls).toEqual([['date', { ascending: false }], ['id']]);
  });

  it('only looks back a few weeks by default, and scans all history when sinceDate is null', async () => {
    withPaymentPair();

    await reconcileCardPayments();
    const [column, since] = state.gteCalls[0] as [string, string];
    const daysBack = (Date.now() - Date.parse(since)) / (24 * 60 * 60 * 1000);
    expect(column).toBe('date');
    expect(daysBack).toBeGreaterThan(20);
    expect(daysBack).toBeLessThan(23);

    state.gteCalls = [];
    await reconcileCardPayments({ sinceDate: null });
    expect(state.gteCalls).toEqual([]);
  });
});

describe('retypeInvestmentsReadingAsCardBills', () => {
  const investment = (overrides: Record<string, unknown>) =>
    tx({ account_id: 'bank', transaction_type: 'investment', date: today(), plaid_category: { primary: 'TRANSFER_OUT' }, ...overrides });

  beforeEach(() => {
    state.updates = [];
    state.eqCalls = [];
    state.transactions = [];
    state.mappings = [];
    state.failTransactions = false;
  });

  it('retypes brokerage looking rows whose raw text is a card bill, and leaves real contributions alone', async () => {
    state.transactions = [
      investment({ id: 'bill', amount: 520.13, merchant_name: 'Robinhood', original_description: 'Robinhood Ccb - Payment Withdrawal WITHDRAWAL' }),
      investment({ id: 'bill-2', amount: 55.52, merchant_name: 'Robinhood', original_description: 'Robinhood Card - Payment Withdrawal WITHDRAWAL' }),
      investment({ id: 'contribution', amount: 540, merchant_name: 'Robinhood', original_description: 'Robinhood - Debits Withdrawal WITHDRAWAL' }),
    ];

    const changed = await retypeInvestmentsReadingAsCardBills();

    expect(changed.map(c => c.id).sort()).toEqual(['bill', 'bill-2']);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].ids.sort()).toEqual(['bill', 'bill-2']);
    expect(state.updates[0].values).toEqual({ transaction_type: 'transfer', category_id: null, needs_review: false });
  });

  it('only asks the database for investments, and re-checks at write time that each is still one the user has not typed', async () => {
    state.transactions = [
      investment({ id: 'bill', amount: 10, merchant_name: 'Acme', original_description: 'Acme Ccb - Payment' }),
    ];

    await retypeInvestmentsReadingAsCardBills();

    expect(state.eqCalls).toContainEqual(['transaction_type', 'investment']);
    expect(state.updates[0].guards).toEqual([
      ['or', 'type_manually_set.is.null,type_manually_set.eq.false'],
      ['eq', 'transaction_type', 'investment'],
    ]);
  });

  it('leaves a row alone when the user has a merchant rule that sets its type', async () => {
    state.mappings = [{ id: 'm1', original_name: 'Acme', display_name: 'Acme', default_category_id: null, default_transaction_type: 'investment' }];
    state.transactions = [
      investment({ id: 'ruled', amount: 10, merchant_name: 'Acme', original_description: 'Acme Ccb - Payment' }),
    ];

    expect(await retypeInvestmentsReadingAsCardBills()).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it('never retypes a row the user typed by hand', async () => {
    state.transactions = [
      investment({ id: 'manual', amount: 10, merchant_name: 'Acme', original_description: 'Acme Ccb - Payment', type_manually_set: true }),
    ];

    expect(await retypeInvestmentsReadingAsCardBills()).toEqual([]);
    expect(state.updates).toEqual([]);
  });

  it('reports without writing when apply is false', async () => {
    state.transactions = [
      investment({ id: 'bill', amount: 10, merchant_name: 'Acme', original_description: 'Acme Ccb - Payment' }),
    ];

    const changed = await retypeInvestmentsReadingAsCardBills({ apply: false });

    expect(changed.map(c => c.id)).toEqual(['bill']);
    expect(state.updates).toEqual([]);
  });
});

describe('reconcileCardPaymentsAfterSync', () => {
  beforeEach(() => {
    state.updates = [];
    state.gteCalls = [];
    state.failTransactions = false;
  });

  it('never throws, so a failed cleanup cannot fail the sync that triggered it', async () => {
    state.failTransactions = true;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(reconcileCardPaymentsAfterSync()).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
  });

  it('passes the date window through, so a first link can scan its whole history', async () => {
    state.accounts = [];
    state.transactions = [];

    await reconcileCardPaymentsAfterSync({ sinceDate: null });

    expect(state.gteCalls).toEqual([]);
  });
});
