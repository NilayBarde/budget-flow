# Venmo Settlement Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link a linked Venmo account's transactions to the split transactions they settle, without ever double-counting a split's totals or touching existing `transaction_splits` rows.

**Architecture:** A purely-additive migration (one new table, one new boolean column) backs a pure matching function (amount + date-window matching, same shape as the existing `card-payment-pairing.ts`), wrapped by a DB-aware reconciliation service (same shape as `card-payment-reconciliation.ts`) hooked into the post-sync pipeline. A thin route exposes pending settlements and manual link/unlink. The client surfaces unsettled splits via a dashboard card and an inline transaction badge.

**Tech Stack:** Express + TypeScript + Supabase (server), React + TanStack Query + Vite (client), Vitest on both.

**Spec:** `docs/superpowers/specs/2026-10-11-venmo-tracking-design.md`

## Global Constraints

- Never write to `transaction_splits` columns from this feature — settlement amounts are always derived from `transaction_split_settlements`, read-only against splits.
- Respect `type_manually_set` on a Venmo transaction: never auto-reclassify a transaction the user hand-typed.
- Only money *arriving* on the Venmo account (negative amount, per this codebase's sign convention — see `transaction-type.ts`) can settle a split; a split only exists on a transaction the user themselves paid, so the "others owe me" direction is the only one that can structurally occur. A Venmo send that doesn't match anything stays a normal expense — no "you owe" matching path exists.
- Every route handler must be wrapped in `asyncHandler` (per `CLAUDE.md`).
- All new server modules use `.js`-suffixed relative imports (ESM), matching every existing file in `server/src`.
- Migration file: `migrations/028_add_venmo_settlements.sql` (next after `027_add_transaction_split_dismissed.sql`).

---

### Task 1: Migration — settlement table and settlement flag

**Files:**
- Create: `migrations/028_add_venmo_settlements.sql`

**Interfaces:**
- Produces: table `transaction_split_settlements(id, split_id, venmo_transaction_id, amount, created_at)`; column `transactions.is_venmo_settlement BOOLEAN NOT NULL DEFAULT FALSE`. Both consumed by Tasks 2–6.

- [ ] **Step 1: Write the migration**

```sql
-- Migration: track which Venmo transactions settle which transaction_splits.
-- Run this in the Supabase SQL editor before deploying the code that reads/writes it.
--
-- Purely additive: no existing column changes meaning, no backfill. A split's settled
-- amount is always derived (SUM(amount) FROM transaction_split_settlements WHERE
-- split_id = ?), never stored on transaction_splits itself, so this migration cannot
-- alter the result of any existing split calculation.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_venmo_settlement BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS transaction_split_settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_id UUID NOT NULL REFERENCES transaction_splits(id) ON DELETE CASCADE,
  venmo_transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_split_settlements_split_id
  ON transaction_split_settlements(split_id);
CREATE INDEX IF NOT EXISTS idx_split_settlements_venmo_transaction_id
  ON transaction_split_settlements(venmo_transaction_id);

ALTER TABLE transaction_split_settlements ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Sanity-check syntax**

Run: `cat migrations/028_add_venmo_settlements.sql` and read it back — confirm it mirrors
the style of `migrations/027_add_transaction_split_dismissed.sql` (comment header, `IF NOT
EXISTS` guards). There is no local DB to run this against (per `CLAUDE.md`, migrations run
manually in the Supabase SQL editor) — this is a read-and-verify step, not an executed test.

- [ ] **Step 3: Commit**

```bash
git add migrations/028_add_venmo_settlements.sql
git commit -m "Add venmo settlement tracking migration"
```

---

### Task 2: Venmo account detection helper

**Files:**
- Modify: `server/src/services/transaction-type.ts`
- Test: `server/src/services/__tests__/transaction-type.test.ts`

**Interfaces:**
- Produces: `isVenmoAccount(institutionName?: string | null, accountName?: string | null): boolean`, exported from `transaction-type.ts`. Consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Add to `server/src/services/__tests__/transaction-type.test.ts`:

```typescript
import { isVenmoAccount } from '../transaction-type.js';

describe('isVenmoAccount', () => {
  it('matches when the institution name says Venmo', () => {
    expect(isVenmoAccount('Venmo', 'My Venmo Balance')).toBe(true);
  });

  it('matches when only the account name says Venmo', () => {
    expect(isVenmoAccount(null, 'Venmo')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isVenmoAccount('VENMO', null)).toBe(true);
  });

  it('does not match an unrelated bank', () => {
    expect(isVenmoAccount('Chase', 'Chase Checking')).toBe(false);
  });

  it('does not match when both names are null', () => {
    expect(isVenmoAccount(null, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --prefix server -- transaction-type -t isVenmoAccount`
Expected: FAIL with "isVenmoAccount is not a function" / not exported.

- [ ] **Step 3: Implement**

Add to `server/src/services/transaction-type.ts`, near `isCashAccount`:

```typescript
// An account whose institution or account name says Venmo. Text-based like the gambling-operator
// and investment-broker checks above, since Plaid's account_type/subtype for Venmo isn't a
// reliable signal to key off of.
export const isVenmoAccount = (
  institutionName?: string | null,
  accountName?: string | null,
): boolean => [institutionName, accountName].some((text) => Boolean(text) && /venmo/i.test(text as string));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --prefix server -- transaction-type -t isVenmoAccount`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/transaction-type.ts server/src/services/__tests__/transaction-type.test.ts
git commit -m "Add isVenmoAccount helper for settlement matching"
```

---

### Task 3: Pure settlement-matching function

**Files:**
- Create: `server/src/services/venmo-settlement-matching.ts`
- Test: `server/src/services/__tests__/venmo-settlement-matching.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no DB).
- Produces:
  - `interface SplitCandidate { id: string; date: string; remainingAmount: number }`
  - `interface VenmoTransactionCandidate { id: string; amount: number; date: string; typeManuallySet?: boolean | null }`
  - `interface SettlementMatch { venmoTransactionId: string; splitIds: string[]; splitAmounts: Record<string, number> }`
  - `findSettlementMatches(venmoTxns: VenmoTransactionCandidate[], splits: SplitCandidate[], windowDays?: number): SettlementMatch[]`
  - `DEFAULT_WINDOW_DAYS`, `MAX_SPLITS_PER_MATCH` constants.

  Consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Create `server/src/services/__tests__/venmo-settlement-matching.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { findSettlementMatches, type SplitCandidate, type VenmoTransactionCandidate } from '../venmo-settlement-matching.js';

let counter = 0;
const split = (overrides: Partial<SplitCandidate> = {}): SplitCandidate => ({
  id: `split${++counter}`,
  date: '2026-08-01',
  remainingAmount: 25,
  ...overrides,
});
const venmo = (overrides: Partial<VenmoTransactionCandidate> = {}): VenmoTransactionCandidate => ({
  id: `v${++counter}`,
  amount: -25, // money in
  date: '2026-08-03',
  typeManuallySet: false,
  ...overrides,
});

describe('findSettlementMatches', () => {
  it('matches a single Venmo deposit to one unsettled split of the same amount', () => {
    const s = split({ remainingAmount: 25 });
    const v = venmo({ amount: -25 });
    expect(findSettlementMatches([v], [s])).toEqual([
      { venmoTransactionId: v.id, splitIds: [s.id], splitAmounts: { [s.id]: 25 } },
    ]);
  });

  it('does not match a Venmo send (positive amount, money out)', () => {
    const s = split({ remainingAmount: 25 });
    const v = venmo({ amount: 25 });
    expect(findSettlementMatches([v], [s])).toEqual([]);
  });

  it('does not match a transaction whose type was manually set', () => {
    const s = split({ remainingAmount: 25 });
    const v = venmo({ amount: -25, typeManuallySet: true });
    expect(findSettlementMatches([v], [s])).toEqual([]);
  });

  it('does not match a split outside the lookback window', () => {
    const s = split({ remainingAmount: 25, date: '2026-07-01' });
    const v = venmo({ amount: -25, date: '2026-08-03' }); // 33 days later, default window is 21
    expect(findSettlementMatches([v], [s])).toEqual([]);
  });

  it('matches within a custom window', () => {
    const s = split({ remainingAmount: 25, date: '2026-07-01' });
    const v = venmo({ amount: -25, date: '2026-08-03' });
    expect(findSettlementMatches([v], [s], 40)).toEqual([
      { venmoTransactionId: v.id, splitIds: [s.id], splitAmounts: { [s.id]: 25 } },
    ]);
  });

  it('sum-matches two unsettled splits to one Venmo deposit covering both', () => {
    const s1 = split({ remainingAmount: 12.5 });
    const s2 = split({ remainingAmount: 17.5 });
    const v = venmo({ amount: -30 });
    const [match] = findSettlementMatches([v], [s1, s2]);
    expect(match.venmoTransactionId).toBe(v.id);
    expect(match.splitIds.sort()).toEqual([s1.id, s2.id].sort());
    expect(match.splitAmounts).toEqual({ [s1.id]: 12.5, [s2.id]: 17.5 });
  });

  it('skips an ambiguous sum-match rather than guessing', () => {
    // Two different pairs both sum to 30: either is equally valid, so neither is picked.
    const s1 = split({ remainingAmount: 10 });
    const s2 = split({ remainingAmount: 20 });
    const s3 = split({ remainingAmount: 15 });
    const s4 = split({ remainingAmount: 15 });
    const v = venmo({ amount: -30 });
    expect(findSettlementMatches([v], [s1, s2, s3, s4])).toEqual([]);
  });

  it('skips an ambiguous 1:1 match rather than guessing which split it was', () => {
    // Two unrelated splits (two different dinners/friends) happen to owe the same amount.
    // Picking either one would silently settle the wrong split, so neither is picked.
    const s1 = split({ remainingAmount: 25 });
    const s2 = split({ remainingAmount: 25 });
    const v = venmo({ amount: -25 });
    expect(findSettlementMatches([v], [s1, s2])).toEqual([]);
  });

  it('never reuses a split across two different Venmo transactions', () => {
    const s = split({ remainingAmount: 25 });
    const v1 = venmo({ amount: -25, date: '2026-08-03' });
    const v2 = venmo({ amount: -25, date: '2026-08-04' });
    const matches = findSettlementMatches([v1, v2], [s]);
    expect(matches).toHaveLength(1);
    expect(matches[0].venmoTransactionId).toBe(v1.id);
  });

  it('returns no match when no combination of splits sums to the amount', () => {
    const s = split({ remainingAmount: 10 });
    const v = venmo({ amount: -25 });
    expect(findSettlementMatches([v], [s])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --prefix server -- venmo-settlement-matching`
Expected: FAIL — module `../venmo-settlement-matching.js` does not exist.

- [ ] **Step 3: Implement**

Create `server/src/services/venmo-settlement-matching.ts`:

```typescript
// Pure helper (no DB deps) so it can be unit-tested in isolation, mirroring card-payment-pairing.
//
// A split only ever exists on a transaction the user themselves paid, so only one direction can
// occur: money arriving on the Venmo account (a negative amount, per this codebase's sign
// convention) settles an unsettled "others owe me" split. A Venmo send that matches nothing
// stays a normal expense — there is no "I owe them" matching path, because this app has no
// recorded transaction for an expense someone else paid.

export interface SplitCandidate {
  id: string;
  /** The parent transaction's date, for the lookback window check. */
  date: string;
  /** abs(split.amount) minus whatever is already settled against it. Always > 0. */
  remainingAmount: number;
}

export interface VenmoTransactionCandidate {
  id: string;
  /** Plaid sign: positive = money out, negative = money in. */
  amount: number;
  date: string;
  typeManuallySet?: boolean | null;
}

export interface SettlementMatch {
  venmoTransactionId: string;
  splitIds: string[];
  /** Amount applied to each split id, keyed by split id. */
  splitAmounts: Record<string, number>;
}

export const DEFAULT_WINDOW_DAYS = 21;
export const MAX_SPLITS_PER_MATCH = 5;
const AMOUNT_TOLERANCE_CENTS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
// Combinatorial search over unsettled splits is only tractable for small candidate pools.
const MAX_CANDIDATES_FOR_SUM_SEARCH = 20;

const toCents = (n: number): number => Math.round(Math.abs(n) * 100);
const daysBetween = (a: string, b: string): number => Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS;

/**
 * All combinations (up to maxSize splits) of candidates whose remainingAmount sums to
 * targetCents within tolerance. Stops searching as soon as a second distinct combination is
 * found, since an ambiguous match is treated the same as none.
 */
const findSumCombinations = (
  candidates: SplitCandidate[],
  targetCents: number,
  maxSize: number,
): SplitCandidate[][] => {
  const results: SplitCandidate[][] = [];
  if (candidates.length > MAX_CANDIDATES_FOR_SUM_SEARCH) return results;

  const search = (start: number, chosen: SplitCandidate[], sumCents: number): void => {
    if (results.length > 1) return;
    if (chosen.length > 0 && Math.abs(sumCents - targetCents) <= AMOUNT_TOLERANCE_CENTS) {
      results.push([...chosen]);
      return;
    }
    if (chosen.length >= maxSize || sumCents > targetCents + AMOUNT_TOLERANCE_CENTS) return;
    for (let i = start; i < candidates.length; i++) {
      search(i + 1, [...chosen, candidates[i]], sumCents + toCents(candidates[i].remainingAmount));
      if (results.length > 1) return;
    }
  };
  search(0, [], 0);
  return results;
};

export const findSettlementMatches = (
  venmoTxns: VenmoTransactionCandidate[],
  splits: SplitCandidate[],
  windowDays: number = DEFAULT_WINDOW_DAYS,
): SettlementMatch[] => {
  const usedSplitIds = new Set<string>();
  const matches: SettlementMatch[] = [];

  for (const txn of venmoTxns) {
    if (txn.typeManuallySet) continue;
    if (txn.amount >= 0) continue; // only money coming in can settle a split

    const targetCents = toCents(txn.amount);
    const candidates = splits.filter(
      (s) => !usedSplitIds.has(s.id) && daysBetween(txn.date, s.date) <= windowDays,
    );

    // Collecting every exact match (not just the first) so two unrelated splits that happen to
    // owe the same amount are treated as ambiguous instead of silently picking whichever is
    // first in the array.
    const exactMatches = candidates.filter((s) => Math.abs(toCents(s.remainingAmount) - targetCents) <= AMOUNT_TOLERANCE_CENTS);
    if (exactMatches.length === 1) {
      const [exact] = exactMatches;
      matches.push({ venmoTransactionId: txn.id, splitIds: [exact.id], splitAmounts: { [exact.id]: exact.remainingAmount } });
      usedSplitIds.add(exact.id);
      continue;
    }
    if (exactMatches.length > 1) continue; // ambiguous: two splits owe the same amount, don't guess

    const combinations = findSumCombinations(candidates, targetCents, MAX_SPLITS_PER_MATCH);
    if (combinations.length === 1) {
      const picked = combinations[0];
      matches.push({
        venmoTransactionId: txn.id,
        splitIds: picked.map((s) => s.id),
        splitAmounts: Object.fromEntries(picked.map((s) => [s.id, s.remainingAmount])),
      });
      for (const s of picked) usedSplitIds.add(s.id);
    }
    // 0 combinations (no match) or >1 (ambiguous): leave unmatched for manual linking.
  }

  return matches;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --prefix server -- venmo-settlement-matching`
Expected: PASS (all 10 cases).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/venmo-settlement-matching.ts server/src/services/__tests__/venmo-settlement-matching.test.ts
git commit -m "Add pure Venmo settlement matching function"
```

---

### Task 4: DB-aware reconciliation service

**Files:**
- Create: `server/src/services/venmo-settlement-reconciliation.ts`
- Test: `server/src/services/__tests__/venmo-settlement-reconciliation.test.ts`

**Interfaces:**
- Consumes: `findSettlementMatches`, `SplitCandidate`, `VenmoTransactionCandidate` from Task 3; `isVenmoAccount` from Task 2; `supabase` from `server/src/db/supabase.ts`.
- Produces:
  - `interface UnsettledSplit { splitId: string; transactionId: string; description: string; date: string; remainingAmount: number }`
  - `loadUnsettledSplits(): Promise<UnsettledSplit[]>` — consumed by Task 6's pending-settlements route.
  - `interface ReconcileVenmoOptions { sinceDate?: string | null; apply?: boolean }`
  - `interface VenmoSettlementResult { venmoTransactionId: string; splitIds: string[]; totalAmount: number }`
  - `reconcileVenmoSettlements(options?: ReconcileVenmoOptions): Promise<VenmoSettlementResult[]>`
  - `reconcileVenmoSettlementsAfterSync(options?: Pick<ReconcileVenmoOptions, 'sinceDate'>): Promise<void>` — consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

Create `server/src/services/__tests__/venmo-settlement-reconciliation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// A minimal chainable stand-in for the Supabase query builder, tracking inserts/updates by table
// so assertions can check exactly what was written without a real database.
const state = {
  accounts: [] as { id: string; institution_name: string | null; account_name: string | null }[],
  transactions: [] as Record<string, unknown>[],
  splits: [] as Record<string, unknown>[],
  settlements: [] as Record<string, unknown>[],
  inserts: [] as { table: string; rows: Record<string, unknown>[] }[],
  updates: [] as { table: string; values: Record<string, unknown>; id: string }[],
};

const resetState = () => {
  state.accounts = [];
  state.transactions = [];
  state.splits = [];
  state.settlements = [];
  state.inserts = [];
  state.updates = [];
};

const tableData = (table: string): Record<string, unknown>[] => {
  if (table === 'accounts') return state.accounts;
  if (table === 'transactions') return state.transactions;
  if (table === 'transaction_splits') return state.splits;
  if (table === 'transaction_split_settlements') return state.settlements;
  throw new Error(`unexpected table ${table}`);
};

vi.mock('../../db/supabase.js', () => ({
  supabase: {
    from: (table: string) => {
      let filtered = [...tableData(table)];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          filtered = filtered.filter((r) => vals.includes(r[col]));
          return builder;
        },
        insert: (rows: Record<string, unknown>[]) => {
          state.inserts.push({ table, rows });
          tableData(table).push(...rows);
          return Promise.resolve({ data: rows, error: null });
        },
        update: (values: Record<string, unknown>) => ({
          eq: (col: string, val: unknown) => {
            const row = tableData(table).find((r) => r[col] === val);
            if (row) {
              Object.assign(row, values);
              state.updates.push({ table, values, id: val as string });
            }
            return Promise.resolve({ data: null, error: null });
          },
        }),
        then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: filtered, error: null }),
      };
      return builder;
    },
  },
}));

const { reconcileVenmoSettlements, loadUnsettledSplits } = await import('../venmo-settlement-reconciliation.js');

describe('venmo-settlement-reconciliation', () => {
  beforeEach(resetState);

  const seedBasicScenario = () => {
    state.accounts = [
      { id: 'venmo-acct', institution_name: 'Venmo', account_name: null },
      { id: 'bank-acct', institution_name: 'Chase', account_name: 'Checking' },
    ];
    state.transactions = [
      {
        id: 'dinner-txn',
        account_id: 'bank-acct',
        amount: 50,
        date: '2026-08-01',
        transaction_type: 'expense',
        type_manually_set: false,
        is_venmo_settlement: false,
      },
      {
        id: 'venmo-deposit',
        account_id: 'venmo-acct',
        amount: -25,
        date: '2026-08-03',
        transaction_type: 'transfer',
        type_manually_set: false,
        is_venmo_settlement: false,
      },
    ];
    state.splits = [
      { id: 'split-mine', parent_transaction_id: 'dinner-txn', amount: 25, is_my_share: true },
      { id: 'split-theirs', parent_transaction_id: 'dinner-txn', amount: 25, is_my_share: false },
    ];
  };

  it('loadUnsettledSplits returns only the others-owe-me split, not my own share', async () => {
    seedBasicScenario();
    const unsettled = await loadUnsettledSplits();
    expect(unsettled).toEqual([
      { splitId: 'split-theirs', transactionId: 'dinner-txn', date: '2026-08-01', remainingAmount: 25 },
    ]);
  });

  it('loadUnsettledSplits excludes a split already fully covered by a settlement', async () => {
    seedBasicScenario();
    state.settlements = [{ id: 's1', split_id: 'split-theirs', venmo_transaction_id: 'venmo-deposit', amount: 25 }];
    expect(await loadUnsettledSplits()).toEqual([]);
  });

  it('matches and applies: inserts a settlement row and retypes the Venmo transaction', async () => {
    seedBasicScenario();
    const results = await reconcileVenmoSettlements({ apply: true });

    expect(results).toEqual([{ venmoTransactionId: 'venmo-deposit', splitIds: ['split-theirs'], totalAmount: 25 }]);
    expect(state.settlements).toEqual([
      expect.objectContaining({ split_id: 'split-theirs', venmo_transaction_id: 'venmo-deposit', amount: 25 }),
    ]);
    const venmoTxn = state.transactions.find((t) => t.id === 'venmo-deposit');
    expect(venmoTxn).toMatchObject({ transaction_type: 'transfer', is_venmo_settlement: true });
  });

  it('dry run (apply: false) reports the match without writing anything', async () => {
    seedBasicScenario();
    const results = await reconcileVenmoSettlements({ apply: false });

    expect(results).toEqual([{ venmoTransactionId: 'venmo-deposit', splitIds: ['split-theirs'], totalAmount: 25 }]);
    expect(state.settlements).toEqual([]);
    expect(state.transactions.find((t) => t.id === 'venmo-deposit')).toMatchObject({ is_venmo_settlement: false });
  });

  it('is idempotent: re-running after applying finds nothing left to match', async () => {
    seedBasicScenario();
    await reconcileVenmoSettlements({ apply: true });
    const second = await reconcileVenmoSettlements({ apply: true });
    expect(second).toEqual([]);
  });

  it('never touches a Venmo transaction whose type was manually set', async () => {
    seedBasicScenario();
    state.transactions.find((t) => t.id === 'venmo-deposit')!.type_manually_set = true;
    const results = await reconcileVenmoSettlements({ apply: true });
    expect(results).toEqual([]);
    expect(state.settlements).toEqual([]);
  });

  it('ignores transactions on non-Venmo accounts entirely', async () => {
    seedBasicScenario();
    // Same shape as the real Venmo deposit, but sitting on the bank account instead.
    state.transactions.push({
      id: 'bank-deposit',
      account_id: 'bank-acct',
      amount: -25,
      date: '2026-08-03',
      transaction_type: 'return',
      type_manually_set: false,
      is_venmo_settlement: false,
    });
    const results = await reconcileVenmoSettlements({ apply: true });
    expect(results).toEqual([{ venmoTransactionId: 'venmo-deposit', splitIds: ['split-theirs'], totalAmount: 25 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --prefix server -- venmo-settlement-reconciliation`
Expected: FAIL — module `../venmo-settlement-reconciliation.js` does not exist.

- [ ] **Step 3: Implement**

Create `server/src/services/venmo-settlement-reconciliation.ts`:

```typescript
import { supabase } from '../db/supabase.js';
import { isVenmoAccount } from './transaction-type.js';
import {
  findSettlementMatches,
  type SplitCandidate,
  type VenmoTransactionCandidate,
} from './venmo-settlement-matching.js';

export interface UnsettledSplit {
  splitId: string;
  transactionId: string;
  date: string;
  remainingAmount: number;
}

export interface ReconcileVenmoOptions {
  /** Only consider Venmo transactions on or after this date. Default: last 90 days. */
  sinceDate?: string | null;
  /** false reports what would change without writing. */
  apply?: boolean;
}

export interface VenmoSettlementResult {
  venmoTransactionId: string;
  splitIds: string[];
  totalAmount: number;
}

const AMOUNT_TOLERANCE = 0.01;
const DEFAULT_LOOKBACK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

interface SplitRow {
  id: string;
  parent_transaction_id: string;
  amount: number;
  is_my_share: boolean;
}

interface TransactionDateRow {
  id: string;
  date: string;
}

/**
 * Unsettled "others owe me" splits, with their derived remaining amount. Read-only against
 * transaction_splits — nothing here writes to a split, ever.
 */
export const loadUnsettledSplits = async (): Promise<UnsettledSplit[]> => {
  const { data: splitRows, error: splitsError } = await supabase
    .from('transaction_splits')
    .select('id, parent_transaction_id, amount, is_my_share')
    .eq('is_my_share', false);
  if (splitsError) throw splitsError;
  const splits = (splitRows ?? []) as SplitRow[];
  if (splits.length === 0) return [];

  const parentIds = [...new Set(splits.map((s) => s.parent_transaction_id))];
  const { data: parentRows, error: parentsError } = await supabase
    .from('transactions')
    .select('id, date')
    .in('id', parentIds);
  if (parentsError) throw parentsError;
  const datesByTransactionId = new Map(((parentRows ?? []) as TransactionDateRow[]).map((t) => [t.id, t.date]));

  const splitIds = splits.map((s) => s.id);
  const { data: settlementRows, error: settlementsError } = await supabase
    .from('transaction_split_settlements')
    .select('split_id, amount')
    .in('split_id', splitIds);
  if (settlementsError) throw settlementsError;
  const settledBySplitId = new Map<string, number>();
  for (const row of (settlementRows ?? []) as { split_id: string; amount: number }[]) {
    settledBySplitId.set(row.split_id, (settledBySplitId.get(row.split_id) ?? 0) + row.amount);
  }

  return splits
    .map((s) => ({
      splitId: s.id,
      transactionId: s.parent_transaction_id,
      date: datesByTransactionId.get(s.parent_transaction_id) ?? '',
      remainingAmount: Math.abs(s.amount) - (settledBySplitId.get(s.id) ?? 0),
    }))
    .filter((s) => s.remainingAmount > AMOUNT_TOLERANCE);
};

interface VenmoCandidateRow {
  id: string;
  amount: number;
  date: string;
  type_manually_set: boolean | null;
}

const loadUnmatchedVenmoTransactions = async (sinceDate: string | null): Promise<VenmoCandidateRow[]> => {
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, institution_name, account_name');
  if (accountsError) throw accountsError;
  const venmoAccountIds = ((accounts ?? []) as { id: string; institution_name: string | null; account_name: string | null }[])
    .filter((a) => isVenmoAccount(a.institution_name, a.account_name))
    .map((a) => a.id);
  if (venmoAccountIds.length === 0) return [];

  let query = supabase
    .from('transactions')
    .select('id, amount, date, type_manually_set')
    .in('account_id', venmoAccountIds)
    .eq('is_venmo_settlement', false);
  if (sinceDate) query = query.gte('date', sinceDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as VenmoCandidateRow[];
};

/**
 * Match unmatched Venmo transactions to unsettled splits and, when apply is true, write the
 * settlement links and retype the matched Venmo transactions as transfers. Never writes to
 * transaction_splits. Safe to re-run: already-settled splits and already-flagged Venmo
 * transactions are excluded from candidates every time.
 */
export const reconcileVenmoSettlements = async ({
  sinceDate = new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10),
  apply = true,
}: ReconcileVenmoOptions = {}): Promise<VenmoSettlementResult[]> => {
  const [unsettledSplits, venmoRows] = await Promise.all([
    loadUnsettledSplits(),
    loadUnmatchedVenmoTransactions(sinceDate),
  ]);

  const splitCandidates: SplitCandidate[] = unsettledSplits.map((s) => ({
    id: s.splitId,
    date: s.date,
    remainingAmount: s.remainingAmount,
  }));
  const venmoCandidates: VenmoTransactionCandidate[] = venmoRows.map((t) => ({
    id: t.id,
    amount: t.amount,
    date: t.date,
    typeManuallySet: t.type_manually_set,
  }));

  const matches = findSettlementMatches(venmoCandidates, splitCandidates);

  if (apply) {
    for (const match of matches) {
      const rows = match.splitIds.map((splitId) => ({
        split_id: splitId,
        venmo_transaction_id: match.venmoTransactionId,
        amount: match.splitAmounts[splitId],
      }));
      const { error: insertError } = await supabase.from('transaction_split_settlements').insert(rows);
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from('transactions')
        .update({ transaction_type: 'transfer', is_venmo_settlement: true, category_id: null, needs_review: false })
        .eq('id', match.venmoTransactionId);
      if (updateError) throw updateError;
    }
  }

  return matches.map((m) => ({
    venmoTransactionId: m.venmoTransactionId,
    splitIds: m.splitIds,
    totalAmount: Object.values(m.splitAmounts).reduce((sum, amt) => sum + amt, 0),
  }));
};

/**
 * The call the sync pipeline makes once a sync's transactions are saved. Reconciliation is a
 * cleanup pass, so a failure here must never fail the sync that triggered it.
 */
export const reconcileVenmoSettlementsAfterSync = async (
  options: Pick<ReconcileVenmoOptions, 'sinceDate'> = {},
): Promise<void> => {
  try {
    const results = await reconcileVenmoSettlements({ ...options, apply: true });
    if (results.length > 0) console.log(`Matched ${results.length} Venmo settlement(s)`);
  } catch (error) {
    console.error('Venmo settlement reconciliation failed:', error instanceof Error ? error.message : error);
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --prefix server -- venmo-settlement-reconciliation`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/venmo-settlement-reconciliation.ts server/src/services/__tests__/venmo-settlement-reconciliation.test.ts
git commit -m "Add Venmo settlement reconciliation service"
```

---

### Task 5: Hook reconciliation into the sync pipeline

**Files:**
- Modify: `server/src/services/sync-transactions.ts:7, 359` (import + the line calling `reconcileCardPaymentsAfterSync`)

**Interfaces:**
- Consumes: `reconcileVenmoSettlementsAfterSync` from Task 4.

- [ ] **Step 1: Add the import**

In `server/src/services/sync-transactions.ts`, next to the existing card-payment-reconciliation import (line 7):

```typescript
import { reconcileCardPaymentsAfterSync } from './card-payment-reconciliation.js';
import { reconcileVenmoSettlementsAfterSync } from './venmo-settlement-reconciliation.js';
```

- [ ] **Step 2: Call it alongside the card-payment pass**

At line 359, where `reconcileCardPaymentsAfterSync` is already called after `recordSuccessfulSync`:

```typescript
  await recordSuccessfulSync(plaidItemId, syncResult.nextCursor, historicalComplete);
  await reconcileCardPaymentsAfterSync(reconcileSinceDate === undefined ? {} : { sinceDate: reconcileSinceDate });
  await reconcileVenmoSettlementsAfterSync(reconcileSinceDate === undefined ? {} : { sinceDate: reconcileSinceDate });

  return counts;
};
```

- [ ] **Step 3: Verify the server still builds and existing sync tests pass**

Run: `npm run test --prefix server`
Expected: PASS — no existing test exercises this exact line with a spy, so this step is a
regression check (the new import must resolve and the server must compile), not new coverage.
Also run: `npm run build --prefix server` and confirm it exits 0.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/sync-transactions.ts
git commit -m "Run Venmo settlement reconciliation after each sync"
```

---

### Task 6: API routes — pending settlements, manual link, unlink

**Files:**
- Create: `server/src/routes/venmo-settlements.ts`
- Modify: `server/src/index.ts` (register the router)
- Test: `server/src/services/__tests__/venmo-settlement-link.test.ts` (the validation/unlink logic that belongs in a service, kept out of the thin route — see Step 3)

**Interfaces:**
- Consumes: `loadUnsettledSplits`, `reconcileVenmoSettlements` types from Task 4; `detectTransactionType` from `transaction-type.ts`.
- Produces:
  - `GET /api/venmo-settlements/pending` → `UnsettledSplit[]` joined with transaction description, as `{ splitId, transactionId, description, date, remainingAmount }[]`.
  - `POST /api/venmo-settlements/:venmoTransactionId/link` body `{ splitIds: string[] }` → 204, or 400 on amount mismatch / already-settled split / the transaction not being an incoming payment.
  - `DELETE /api/venmo-settlements/:venmoTransactionId` → 204.
  - `linkVenmoSettlement(venmoTransactionId: string, splitIds: string[]): Promise<void>` and `unlinkVenmoSettlement(venmoTransactionId: string): Promise<void>`, exported from `venmo-settlement-reconciliation.ts`, consumed by the route and by Task 7's client (indirectly, via HTTP).

This task adds two more exports to `server/src/services/venmo-settlement-reconciliation.ts` (from Task 4) — the validation logic is kept there, not in the route, so it is unit-testable without an HTTP layer (this repo has no route-level test harness; see `grep -rn "supertest" server` which finds nothing — every route in this codebase is a thin wrapper over a tested service).

- [ ] **Step 1: Write the failing tests**

Create `server/src/services/__tests__/venmo-settlement-link.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = {
  transactions: [] as Record<string, unknown>[],
  splits: [] as Record<string, unknown>[],
  settlements: [] as Record<string, unknown>[],
  inserts: [] as { table: string; rows: Record<string, unknown>[] }[],
  deletes: [] as { table: string; column: string; value: unknown }[],
};

const resetState = () => {
  state.transactions = [];
  state.splits = [];
  state.settlements = [];
  state.inserts = [];
  state.deletes = [];
};

const tableData = (table: string): Record<string, unknown>[] => {
  if (table === 'transactions') return state.transactions;
  if (table === 'transaction_splits') return state.splits;
  if (table === 'transaction_split_settlements') return state.settlements;
  throw new Error(`unexpected table ${table}`);
};

vi.mock('../../db/supabase.js', () => ({
  supabase: {
    from: (table: string) => {
      let filtered = [...tableData(table)];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          filtered = filtered.filter((r) => vals.includes(r[col]));
          return builder;
        },
        insert: (rows: Record<string, unknown>[]) => {
          state.inserts.push({ table, rows });
          tableData(table).push(...rows);
          return Promise.resolve({ data: rows, error: null });
        },
        update: (values: Record<string, unknown>) => ({
          eq: (col: string, val: unknown) => {
            const row = tableData(table).find((r) => r[col] === val);
            if (row) Object.assign(row, values);
            return Promise.resolve({ data: null, error: null });
          },
        }),
        delete: () => ({
          eq: (col: string, val: unknown) => {
            state.deletes.push({ table, column: col, value: val });
            const remaining = tableData(table).filter((r) => r[col] !== val);
            tableData(table).length = 0;
            tableData(table).push(...remaining);
            return Promise.resolve({ data: null, error: null });
          },
        }),
        then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: filtered, error: null }),
      };
      return builder;
    },
  },
}));

const { linkVenmoSettlement, unlinkVenmoSettlement } = await import('../venmo-settlement-reconciliation.js');

describe('linkVenmoSettlement', () => {
  beforeEach(() => {
    resetState();
    state.transactions = [{ id: 'venmo-txn', amount: -25, is_venmo_settlement: false, transaction_type: 'expense' }];
    state.splits = [{ id: 'split-1', parent_transaction_id: 'dinner', amount: 25, is_my_share: false }];
  });

  it('links a split whose remaining amount matches the transaction amount', async () => {
    await linkVenmoSettlement('venmo-txn', ['split-1']);
    expect(state.settlements).toEqual([
      expect.objectContaining({ split_id: 'split-1', venmo_transaction_id: 'venmo-txn', amount: 25 }),
    ]);
    expect(state.transactions[0]).toMatchObject({ transaction_type: 'transfer', is_venmo_settlement: true });
  });

  it('rejects when the chosen splits do not sum to the transaction amount', async () => {
    state.splits = [{ id: 'split-1', parent_transaction_id: 'dinner', amount: 10, is_my_share: false }];
    await expect(linkVenmoSettlement('venmo-txn', ['split-1'])).rejects.toThrow(/amount/i);
    expect(state.settlements).toEqual([]);
  });

  it('rejects a split that is already fully settled', async () => {
    state.settlements = [{ id: 's1', split_id: 'split-1', venmo_transaction_id: 'other-txn', amount: 25 }];
    await expect(linkVenmoSettlement('venmo-txn', ['split-1'])).rejects.toThrow(/settled/i);
  });

  it('rejects linking a Venmo send (money out), even if the amount matches', async () => {
    // A split can only be settled by money arriving, never by money the user sent — otherwise a
    // real expense would get flipped to a transfer and silently drop out of spending totals.
    state.transactions = [{ id: 'venmo-txn', amount: 25, is_venmo_settlement: false, transaction_type: 'expense' }];
    await expect(linkVenmoSettlement('venmo-txn', ['split-1'])).rejects.toThrow(/incoming/i);
    expect(state.settlements).toEqual([]);
  });
});

describe('unlinkVenmoSettlement', () => {
  it('removes the settlement rows and reverts the transaction type', async () => {
    resetState();
    state.transactions = [
      { id: 'venmo-txn', amount: -25, is_venmo_settlement: true, transaction_type: 'transfer', merchant_name: 'Venmo', original_description: null, plaid_category: null },
    ];
    state.settlements = [{ id: 's1', split_id: 'split-1', venmo_transaction_id: 'venmo-txn', amount: 25 }];

    await unlinkVenmoSettlement('venmo-txn');

    expect(state.settlements).toEqual([]);
    expect(state.transactions[0]).toMatchObject({ is_venmo_settlement: false, transaction_type: 'return' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --prefix server -- venmo-settlement-link`
Expected: FAIL — `linkVenmoSettlement` / `unlinkVenmoSettlement` not exported.

Note: the test file above now has 5 cases total — 4 for `linkVenmoSettlement` (including the
new direction-check case) plus 1 for `unlinkVenmoSettlement` — Step 4 below expects all 5 to
pass.

- [ ] **Step 3: Implement the two service functions**

Add to `server/src/services/venmo-settlement-reconciliation.ts` (append after `reconcileVenmoSettlementsAfterSync`):

```typescript
import { detectTransactionType } from './transaction-type.js';
import type { PlaidPFC } from './categorizer.js';

/**
 * Manual override for a match the auto-matcher missed. Validates the chosen splits sum to the
 * transaction's amount and aren't already settled, exactly like the auto-matcher would, then
 * writes the same settlement rows and type flip reconcileVenmoSettlements applies.
 */
export const linkVenmoSettlement = async (venmoTransactionId: string, splitIds: string[]): Promise<void> => {
  const { data: txnData, error: txnError } = await supabase
    .from('transactions')
    .select('id, amount')
    .eq('id', venmoTransactionId);
  if (txnError) throw txnError;
  const txn = (txnData as { id: string; amount: number }[] | null)?.[0];
  if (!txn) throw new Error('Venmo transaction not found');
  // Same direction rule reconcileVenmoSettlements enforces: a split is only ever settled by
  // money arriving, never by money sent out. Without this, linking the wrong transaction would
  // flip a real expense to a transfer and silently drop it out of spending totals.
  if (txn.amount >= 0) throw new Error('Only an incoming Venmo payment can settle a split');

  const { data: splitRows, error: splitsError } = await supabase
    .from('transaction_splits')
    .select('id, amount')
    .in('id', splitIds);
  if (splitsError) throw splitsError;
  const splits = (splitRows ?? []) as { id: string; amount: number }[];
  if (splits.length !== splitIds.length) throw new Error('One or more splits not found');

  const { data: settlementRows, error: settlementsError } = await supabase
    .from('transaction_split_settlements')
    .select('split_id, amount')
    .in('split_id', splitIds);
  if (settlementsError) throw settlementsError;
  const settledBySplitId = new Map<string, number>();
  for (const row of (settlementRows ?? []) as { split_id: string; amount: number }[]) {
    settledBySplitId.set(row.split_id, (settledBySplitId.get(row.split_id) ?? 0) + row.amount);
  }

  const splitAmounts: Record<string, number> = {};
  let total = 0;
  for (const split of splits) {
    const remaining = Math.abs(split.amount) - (settledBySplitId.get(split.id) ?? 0);
    if (remaining <= AMOUNT_TOLERANCE) throw new Error(`Split ${split.id} is already settled`);
    splitAmounts[split.id] = remaining;
    total += remaining;
  }

  if (Math.abs(total - Math.abs(txn.amount)) > AMOUNT_TOLERANCE) {
    throw new Error("Chosen splits' amount does not match the transaction amount");
  }

  const rows = splitIds.map((splitId) => ({
    split_id: splitId,
    venmo_transaction_id: venmoTransactionId,
    amount: splitAmounts[splitId],
  }));
  const { error: insertError } = await supabase.from('transaction_split_settlements').insert(rows);
  if (insertError) throw insertError;

  const { error: updateError } = await supabase
    .from('transactions')
    .update({ transaction_type: 'transfer', is_venmo_settlement: true, category_id: null, needs_review: false })
    .eq('id', venmoTransactionId);
  if (updateError) throw updateError;
};

/**
 * Reverts a (manual or automatic) match: deletes its settlement rows and re-detects the
 * transaction's type as if the match had never happened. Never touches transaction_splits.
 */
export const unlinkVenmoSettlement = async (venmoTransactionId: string): Promise<void> => {
  const { error: deleteError } = await supabase
    .from('transaction_split_settlements')
    .delete()
    .eq('venmo_transaction_id', venmoTransactionId);
  if (deleteError) throw deleteError;

  const { data: txnData, error: txnError } = await supabase
    .from('transactions')
    .select('id, amount, merchant_name, original_description, plaid_category')
    .eq('id', venmoTransactionId);
  if (txnError) throw txnError;
  const txn = (txnData as
    | { id: string; amount: number; merchant_name: string | null; original_description: string | null; plaid_category: PlaidPFC | null }[]
    | null)?.[0];
  if (!txn) throw new Error('Venmo transaction not found');

  const revertedType = detectTransactionType(
    txn.amount,
    [txn.merchant_name ?? '', txn.original_description ?? ''],
    txn.plaid_category,
  );

  const { error: updateError } = await supabase
    .from('transactions')
    .update({ transaction_type: revertedType, is_venmo_settlement: false })
    .eq('id', venmoTransactionId);
  if (updateError) throw updateError;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --prefix server -- venmo-settlement-link`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Add the route and a description-joining query for the pending list**

Create `server/src/routes/venmo-settlements.ts`:

```typescript
import { Router } from 'express';
import { supabase } from '../db/supabase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { loadUnsettledSplits, linkVenmoSettlement, unlinkVenmoSettlement } from '../services/venmo-settlement-reconciliation.js';

const router = Router();

// Pending settlements, with the parent transaction's description for display.
router.get(
  '/pending',
  asyncHandler(async (_req, res) => {
    const unsettled = await loadUnsettledSplits();
    if (unsettled.length === 0) return res.json([]);

    const transactionIds = [...new Set(unsettled.map((s) => s.transactionId))];
    const { data, error } = await supabase
      .from('transactions')
      .select('id, merchant_display_name, merchant_name')
      .in('id', transactionIds);
    if (error) throw error;
    const descriptionById = new Map(
      ((data ?? []) as { id: string; merchant_display_name: string | null; merchant_name: string }[]).map((t) => [
        t.id,
        t.merchant_display_name || t.merchant_name,
      ]),
    );

    res.json(
      unsettled.map((s) => ({
        splitId: s.splitId,
        transactionId: s.transactionId,
        description: descriptionById.get(s.transactionId) ?? '',
        date: s.date,
        remainingAmount: s.remainingAmount,
      })),
    );
  }),
);

router.post(
  '/:venmoTransactionId/link',
  asyncHandler(async (req, res) => {
    const { venmoTransactionId } = req.params;
    const { splitIds } = req.body as { splitIds?: string[] };
    if (!Array.isArray(splitIds) || splitIds.length === 0) {
      return res.status(400).json({ message: 'splitIds is required' });
    }
    try {
      await linkVenmoSettlement(venmoTransactionId, splitIds);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : 'Failed to link settlement' });
    }
    res.status(204).send();
  }),
);

router.delete(
  '/:venmoTransactionId',
  asyncHandler(async (req, res) => {
    await unlinkVenmoSettlement(req.params.venmoTransactionId);
    res.status(204).send();
  }),
);

export default router;
```

- [ ] **Step 6: Register the router**

In `server/src/index.ts`, add alongside the other route imports (after the `exportRouter` import):

```typescript
const { default: venmoSettlementsRouter } = await import('./routes/venmo-settlements.js');
```

And alongside the other `app.use` registrations (after `app.use('/api/export', exportRouter);`):

```typescript
app.use('/api/venmo-settlements', venmoSettlementsRouter);
```

- [ ] **Step 7: Verify the server builds**

Run: `npm run build --prefix server`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add server/src/services/venmo-settlement-reconciliation.ts server/src/services/__tests__/venmo-settlement-link.test.ts server/src/routes/venmo-settlements.ts server/src/index.ts
git commit -m "Add Venmo settlement API routes"
```

---

### Task 7: Client API functions and types

**Files:**
- Modify: `client/src/types/index.ts` (add `PendingVenmoSettlement`)
- Modify: `client/src/services/api.ts` (add three functions)
- Test: `client/src/services/__tests__/api.test.ts` if it exists, else `client/src/services/__tests__/venmo-settlements-api.test.ts`

**Interfaces:**
- Produces: `interface PendingVenmoSettlement { splitId: string; transactionId: string; description: string; date: string; remainingAmount: number }`; `getPendingVenmoSettlements(): Promise<PendingVenmoSettlement[]>`; `linkVenmoSettlement(venmoTransactionId: string, splitIds: string[]): Promise<void>`; `unlinkVenmoSettlement(venmoTransactionId: string): Promise<void>`. Consumed by Task 8's hooks.

- [ ] **Step 1: Check for an existing api.ts test file**

Run: `ls client/src/services/__tests__/ 2>/dev/null`. If `api.test.ts` exists, add the new
tests there following its existing `fetch` mocking style; otherwise create
`client/src/services/__tests__/venmo-settlements-api.test.ts` using the pattern below (mocking
global `fetch` directly, since `fetchApi` wraps `fetch`).

- [ ] **Step 2: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPendingVenmoSettlements, linkVenmoSettlement, unlinkVenmoSettlement } from '../api';

describe('venmo settlements api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getPendingVenmoSettlements fetches the pending list', async () => {
    const payload = [{ splitId: 's1', transactionId: 't1', description: 'Dinner', date: '2026-08-01', remainingAmount: 25 }];
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => payload,
    } as Response);

    const result = await getPendingVenmoSettlements();

    expect(result).toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/venmo-settlements/pending'), expect.anything());
  });

  it('linkVenmoSettlement posts the chosen split ids', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({}),
    } as Response);

    await linkVenmoSettlement('venmo-1', ['split-1', 'split-2']);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/venmo-settlements/venmo-1/link'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ splitIds: ['split-1', 'split-2'] }) }),
    );
  });

  it('unlinkVenmoSettlement sends a DELETE', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({}),
    } as Response);

    await unlinkVenmoSettlement('venmo-1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/venmo-settlements/venmo-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --prefix client -- venmo-settlements-api`
Expected: FAIL — `getPendingVenmoSettlements` etc. not exported from `../api`.

- [ ] **Step 4: Add the type**

In `client/src/types/index.ts`, add after `TransactionSplit`:

```typescript
export interface PendingVenmoSettlement {
  splitId: string;
  transactionId: string;
  /** The parent transaction's merchant_display_name/merchant_name. */
  description: string;
  date: string;
  remainingAmount: number;
}
```

- [ ] **Step 5: Add the API functions**

In `client/src/services/api.ts`, add near `createSplit`/`deleteSplits`:

```typescript
export const getPendingVenmoSettlements = () => fetchApi<PendingVenmoSettlement[]>('/venmo-settlements/pending');

export const linkVenmoSettlement = (venmoTransactionId: string, splitIds: string[]) =>
  fetchApi<void>(`/venmo-settlements/${venmoTransactionId}/link`, {
    method: 'POST',
    body: JSON.stringify({ splitIds }),
  });

export const unlinkVenmoSettlement = (venmoTransactionId: string) =>
  fetchApi<void>(`/venmo-settlements/${venmoTransactionId}`, { method: 'DELETE' });
```

(Add `PendingVenmoSettlement` to the existing `import type { ... } from '../types'` at the top of the file.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test --prefix client -- venmo-settlements-api`
Expected: PASS (all 3 cases).

- [ ] **Step 7: Commit**

```bash
git add client/src/types/index.ts client/src/services/api.ts client/src/services/__tests__/venmo-settlements-api.test.ts
git commit -m "Add client API functions for Venmo settlements"
```

---

### Task 8: Client hooks for pending settlements

**Files:**
- Create: `client/src/hooks/useVenmoSettlements.ts`
- Modify: `client/src/hooks/index.ts` (export it)
- Test: `client/src/hooks/__tests__/useVenmoSettlements.test.ts`

**Interfaces:**
- Consumes: `getPendingVenmoSettlements`, `linkVenmoSettlement`, `unlinkVenmoSettlement` from Task 7.
- Produces: `usePendingVenmoSettlements()`, `useLinkVenmoSettlement()`, `useUnlinkVenmoSettlement()`. Consumed by Task 9 and Task 10.

- [ ] **Step 1: Check an existing hook test for the mocking pattern**

Run: `cat client/src/hooks/__tests__/useTransactions.test.ts 2>/dev/null | head -40` (or the
nearest equivalent) to match this codebase's QueryClient-wrapper test setup exactly. Reuse that
wrapper import rather than inventing a new one.

- [ ] **Step 2: Write the failing tests**

Create `client/src/hooks/__tests__/useVenmoSettlements.test.ts`, following the wrapper pattern found in Step 1 (shown here as a self-contained QueryClientProvider wrapper in case no existing helper is exported):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import * as api from '../../services/api';
import { usePendingVenmoSettlements, useLinkVenmoSettlement, useUnlinkVenmoSettlement } from '../useVenmoSettlements';

const makeWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { queryClient, Wrapper: ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  ) };
};

describe('usePendingVenmoSettlements', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('loads the pending settlements list', async () => {
    const payload = [{ splitId: 's1', transactionId: 't1', description: 'Dinner', date: '2026-08-01', remainingAmount: 25 }];
    vi.spyOn(api, 'getPendingVenmoSettlements').mockResolvedValue(payload);
    const { Wrapper } = makeWrapper();

    const { result } = renderHook(() => usePendingVenmoSettlements(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toEqual(payload));
  });
});

describe('useLinkVenmoSettlement', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls the link API and invalidates pending settlements and transactions', async () => {
    const linkSpy = vi.spyOn(api, 'linkVenmoSettlement').mockResolvedValue(undefined);
    const { Wrapper, queryClient } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useLinkVenmoSettlement(), { wrapper: Wrapper });
    await result.current.mutateAsync({ venmoTransactionId: 'v1', splitIds: ['s1'] });

    expect(linkSpy).toHaveBeenCalledWith('v1', ['s1']);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['venmo-settlements'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['transactions'] });
  });
});

describe('useUnlinkVenmoSettlement', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('calls the unlink API and invalidates pending settlements and transactions', async () => {
    const unlinkSpy = vi.spyOn(api, 'unlinkVenmoSettlement').mockResolvedValue(undefined);
    const { Wrapper, queryClient } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUnlinkVenmoSettlement(), { wrapper: Wrapper });
    await result.current.mutateAsync('v1');

    expect(unlinkSpy).toHaveBeenCalledWith('v1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['venmo-settlements'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['transactions'] });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --prefix client -- useVenmoSettlements`
Expected: FAIL — `../useVenmoSettlements` does not exist.

- [ ] **Step 4: Implement**

Create `client/src/hooks/useVenmoSettlements.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';

export const usePendingVenmoSettlements = () =>
  useQuery({
    queryKey: ['venmo-settlements', 'pending'],
    queryFn: api.getPendingVenmoSettlements,
  });

export const useLinkVenmoSettlement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ venmoTransactionId, splitIds }: { venmoTransactionId: string; splitIds: string[] }) =>
      api.linkVenmoSettlement(venmoTransactionId, splitIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venmo-settlements'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};

export const useUnlinkVenmoSettlement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (venmoTransactionId: string) => api.unlinkVenmoSettlement(venmoTransactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venmo-settlements'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
};
```

Add to `client/src/hooks/index.ts`:

```typescript
export * from './useVenmoSettlements';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --prefix client -- useVenmoSettlements`
Expected: PASS (all 3 cases).

- [ ] **Step 6: Commit**

```bash
git add client/src/hooks/useVenmoSettlements.ts client/src/hooks/index.ts client/src/hooks/__tests__/useVenmoSettlements.test.ts
git commit -m "Add client hooks for Venmo settlements"
```

---

### Task 9: Dashboard card for pending settlements

**Files:**
- Create: `client/src/components/dashboard/PendingVenmoSettlementsCard.tsx`
- Modify: `client/src/pages/Dashboard.tsx` (render it next to `LargeUnsplitTransactions`)
- Test: `client/src/components/dashboard/__tests__/PendingVenmoSettlementsCard.test.tsx`

**Interfaces:**
- Consumes: `usePendingVenmoSettlements`, `useLinkVenmoSettlement` from Task 8.

- [ ] **Step 1: Write the failing test**

Follow the structure of `client/src/components/dashboard/__tests__/LargeUnsplitTransactions.test.tsx` (read it first for this codebase's exact render/mock conventions). Create
`client/src/components/dashboard/__tests__/PendingVenmoSettlementsCard.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as hooks from '../../../hooks';
import { PendingVenmoSettlementsCard } from '../PendingVenmoSettlementsCard';

describe('PendingVenmoSettlementsCard', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows "No pending settlements" when the list is empty', () => {
    vi.spyOn(hooks, 'usePendingVenmoSettlements').mockReturnValue({
      data: [], isLoading: false, isError: false,
    } as ReturnType<typeof hooks.usePendingVenmoSettlements>);

    render(<PendingVenmoSettlementsCard />);

    expect(screen.getByText('No pending settlements')).toBeInTheDocument();
  });

  it('lists an unsettled split with its description and remaining amount', () => {
    vi.spyOn(hooks, 'usePendingVenmoSettlements').mockReturnValue({
      data: [{ splitId: 's1', transactionId: 't1', description: 'Dinner at Mia', date: '2026-08-01', remainingAmount: 25 }],
      isLoading: false, isError: false,
    } as ReturnType<typeof hooks.usePendingVenmoSettlements>);

    render(<PendingVenmoSettlementsCard />);

    expect(screen.getByText('Dinner at Mia')).toBeInTheDocument();
    expect(screen.getByText('$25.00')).toBeInTheDocument();
  });

  it('shows a loading spinner while fetching', () => {
    vi.spyOn(hooks, 'usePendingVenmoSettlements').mockReturnValue({
      data: undefined, isLoading: true, isError: false,
    } as ReturnType<typeof hooks.usePendingVenmoSettlements>);

    render(<PendingVenmoSettlementsCard />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', () => {
    vi.spyOn(hooks, 'usePendingVenmoSettlements').mockReturnValue({
      data: undefined, isLoading: false, isError: true,
    } as ReturnType<typeof hooks.usePendingVenmoSettlements>);

    render(<PendingVenmoSettlementsCard />);

    expect(screen.getByText('Could not load pending settlements.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --prefix client -- PendingVenmoSettlementsCard`
Expected: FAIL — `../PendingVenmoSettlementsCard` does not exist.

- [ ] **Step 3: Implement**

Create `client/src/components/dashboard/PendingVenmoSettlementsCard.tsx`, mirroring
`LargeUnsplitTransactions.tsx`'s card shell:

```typescript
import { HandCoins } from 'lucide-react';
import { Card, Spinner } from '../ui';
import { usePendingVenmoSettlements } from '../../hooks';
import { formatCurrency, formatDate } from '../../utils/formatters';

const MAX_ROWS = 5;

export const PendingVenmoSettlementsCard = () => {
  const { data, isLoading, isError } = usePendingVenmoSettlements();

  const settlements = data ?? [];
  const shown = settlements.slice(0, MAX_ROWS);
  const hiddenCount = settlements.length - shown.length;

  return (
    <Card className="flex flex-col" padding="none">
      <div className="p-4 border-b border-midnight-700 flex items-center gap-2">
        <HandCoins className="h-4 w-4 text-accent-400" />
        <h3 className="font-medium text-slate-100">Pending Venmo settlements</h3>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs text-slate-400">Split expenses still waiting on a Venmo payment.</p>
        {isLoading && (
          <div role="status" aria-label="Loading" className="flex justify-center py-2">
            <Spinner />
          </div>
        )}
        {!isLoading && isError && (
          <p className="text-sm text-rose-400">Could not load pending settlements.</p>
        )}
        {!isLoading && !isError && settlements.length === 0 && (
          <p className="text-sm text-slate-400">No pending settlements</p>
        )}
        {shown.map((s) => (
          <div key={s.splitId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <div className="min-w-0 flex-1 basis-32">
              <p className="font-medium text-slate-200 truncate">{s.description}</p>
              <p className="text-xs text-slate-500">{formatDate(s.date)}</p>
            </div>
            <span className="font-semibold text-slate-100 flex-shrink-0">{formatCurrency(s.remainingAmount)}</span>
          </div>
        ))}
        {hiddenCount > 0 && <p className="text-xs text-slate-500">+{hiddenCount} more pending</p>}
      </div>
    </Card>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --prefix client -- PendingVenmoSettlementsCard`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Render it on the Dashboard**

In `client/src/pages/Dashboard.tsx`, import it next to `LargeUnsplitTransactions` and render it
alongside that card (same grid/section) — read the surrounding JSX at the `<LargeUnsplitTransactions` usage first and place the new card as a sibling so the two sit side by side or stacked consistently with the existing layout.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/dashboard/PendingVenmoSettlementsCard.tsx client/src/components/dashboard/__tests__/PendingVenmoSettlementsCard.test.tsx client/src/pages/Dashboard.tsx
git commit -m "Add pending Venmo settlements dashboard card"
```

---

### Task 10: Inline "awaiting settlement" badge on split transactions

**Files:**
- Modify: `client/src/components/transactions/TransactionRow.tsx`
- Modify: `client/src/components/transactions/TransactionList.tsx`
- Modify: `client/src/pages/Transactions.tsx`
- Test: `client/src/components/transactions/__tests__/TransactionRow.test.tsx` (add cases to the existing file if present, else create it)

**Interfaces:**
- Consumes: `usePendingVenmoSettlements` from Task 8.
- Produces: `TransactionRow` gains an optional prop `pendingSettlementAmount?: number`; `TransactionList` gains an optional prop `pendingSettlementAmountsByTransactionId?: Map<string, number>` and passes the looked-up value down per row.

- [ ] **Step 1: Write the failing test for `TransactionRow`**

Read `client/src/components/transactions/__tests__/TransactionRow.test.tsx` first (if it
exists) to match its existing `transaction` fixture builder, then add:

```typescript
it('shows an "Awaiting $X" badge when pendingSettlementAmount is set', () => {
  render(
    <TransactionRow
      transaction={{ ...baseTransaction, is_split: true }}
      onEdit={vi.fn()}
      onSplit={vi.fn()}
      onDelete={vi.fn()}
      pendingSettlementAmount={25}
    />,
  );
  expect(screen.getByText('Awaiting $25.00')).toBeInTheDocument();
});

it('shows no settlement badge when pendingSettlementAmount is absent', () => {
  render(
    <TransactionRow
      transaction={{ ...baseTransaction, is_split: true }}
      onEdit={vi.fn()}
      onSplit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  expect(screen.queryByText(/Awaiting/)).not.toBeInTheDocument();
});
```

(Use whatever `baseTransaction` fixture and render-wrapper the existing test file already
defines — if no such file exists yet, create it following `LargeUnsplitTransactions.test.tsx`'s
import and render style, with a minimal valid `Transaction` object as `baseTransaction`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --prefix client -- TransactionRow`
Expected: FAIL — `pendingSettlementAmount` prop not accepted / badge not rendered.

- [ ] **Step 3: Implement the prop and badge**

In `client/src/components/transactions/TransactionRow.tsx`, add to `TransactionRowProps`:

```typescript
interface TransactionRowProps {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
  onSplit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  isSelected?: boolean;
  onSelect?: (transactionId: string, selected: boolean) => void;
  selectionMode?: boolean;
  /** Remaining amount still owed on this transaction's splits, if any is unsettled. */
  pendingSettlementAmount?: number;
}
```

Update the function signature to destructure it:

```typescript
export const TransactionRow = ({
  transaction, onEdit, onSplit, onDelete, isSelected = false, onSelect, selectionMode = false,
  pendingSettlementAmount,
}: TransactionRowProps) => {
```

Add the badge next to the existing `{transaction.is_split && <Badge ...>Split</Badge>}` at
**both** occurrences (lines 131 and 314 — this component renders a mobile and a desktop layout):

```tsx
{Boolean(pendingSettlementAmount) && (
  <Badge color="#f59e0b" size="sm">{`Awaiting ${formatCurrency(pendingSettlementAmount as number)}`}</Badge>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --prefix client -- TransactionRow`
Expected: PASS.

- [ ] **Step 5: Thread the lookup through `TransactionList`**

In `client/src/components/transactions/TransactionList.tsx`, add an optional prop and pass it
through to each row:

```typescript
interface TransactionListProps {
  // ...existing props...
  pendingSettlementAmountsByTransactionId?: Map<string, number>;
}
```

At the `transactions.map(transaction => (<TransactionRow ... />))` call site, add:

```tsx
pendingSettlementAmount={pendingSettlementAmountsByTransactionId?.get(transaction.id)}
```

- [ ] **Step 6: Build the lookup map in `Transactions.tsx` and pass it down**

In `client/src/pages/Transactions.tsx`, near the existing `useTransactions(effectiveFilters)`
call, add:

```typescript
import { usePendingVenmoSettlements } from '../hooks';

// ...inside the component, alongside the existing useTransactions call:
const { data: pendingSettlements } = usePendingVenmoSettlements();
const pendingSettlementAmountsByTransactionId = useMemo(() => {
  const map = new Map<string, number>();
  for (const s of pendingSettlements ?? []) {
    map.set(s.transactionId, (map.get(s.transactionId) ?? 0) + s.remainingAmount);
  }
  return map;
}, [pendingSettlements]);
```

(Add `useMemo` to the existing `react` import if not already present.) Pass it to the existing
`<TransactionList` usage:

```tsx
<TransactionList
  // ...existing props...
  pendingSettlementAmountsByTransactionId={pendingSettlementAmountsByTransactionId}
/>
```

- [ ] **Step 7: Manually verify in the running app**

Run: `npm run dev` from the repo root, open the Transactions page, and confirm existing rows
still render unchanged (no `pendingSettlementAmount` data yet means no badges) and the page
doesn't error. Full end-to-end verification of a real badge requires a linked Venmo account and
a real settlement match, which needs Plaid sandbox/production credentials — out of scope for
this automated step; note this limitation when reporting the task done.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/transactions/TransactionRow.tsx client/src/components/transactions/TransactionList.tsx client/src/pages/Transactions.tsx client/src/components/transactions/__tests__/TransactionRow.test.tsx
git commit -m "Show an awaiting-settlement badge on split transactions"
```

---

## Out of scope for this plan (per the spec's non-goals)

- Linking the actual Venmo account via Plaid Link in the UI needs no new code (existing Link
  flow already supports any Plaid institution) and is a manual, one-time user action — not an
  engineering task.
- A manual "pick a Venmo transaction to link" picker UI (for cases the auto-matcher and the
  simple link endpoint don't cover smoothly) is left for a follow-up iteration once real usage
  shows what's actually needed; `linkVenmoSettlement`/`useLinkVenmoSettlement` already exist for
  it to call.
- Running `reconcileVenmoSettlements({ apply: false })` against already-synced historical Venmo
  data (if the user already linked Venmo before this shipped) is an operational step, not a code
  task — mention it to the user after Task 6 ships.
