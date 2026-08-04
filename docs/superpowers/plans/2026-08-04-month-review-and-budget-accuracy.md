# Month Review and Budget Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every spending number on the Dashboard trustworthy, then add two Dashboard cards that explain a month's budget overage and surface large transactions that were probably never split.

**Architecture:** Phase 1 extracts the duplicated split-aware "my share" logic into one server service (`category-spend.ts`) and one client util (`my-share.ts`), fixes the returns-ordering bug in budget goals, surfaces pending spend, fixes stale cache invalidation after splits, and normalizes weekly/yearly recurring charges. Phase 2 adds a pure `budget-variance` util plus two presentational cards (`BudgetVariance`, `LargeUnsplitTransactions`) wired into the existing Dashboard grid. No schema changes, no new endpoints.

**Tech Stack:** Express + TypeScript + Supabase client (server), React + TanStack Query + Tailwind v4 + clsx + lucide-react (client), Vitest on both.

**Spec:** `docs/superpowers/specs/2026-08-04-month-review-and-budget-accuracy-design.md`

## Global Constraints

- Work on branch `worktree-month-review-design` (already checked out in this worktree). Never commit to main.
- Do not push or perform any remote write. Local commits only.
- Every server route handler must be wrapped in `asyncHandler` from `server/src/utils/asyncHandler.js` (imports use `.js` suffix because the server is ESM TypeScript).
- All client API calls go through `client/src/services/api.ts`; never call `fetch` in components or hooks.
- Client mutations must cascade-invalidate every related query key.
- Conditional classes use `clsx(...)`; icons come from `lucide-react` only.
- Tests live in `__tests__/` directories next to the code they test; framework is Vitest (`describe` / `it` / `expect`, no jest globals import needed).
- Run server tests with `npm test --prefix server` (targeted: `npx vitest run <file>` from `server/`). Run client tests with `npm test --prefix client` (targeted: `npx vitest run <file>` from `client/`).
- Amount sign convention: positive amount = money out. All display math uses `Math.abs`.
- Never use em dashes or en dashes as punctuation in code comments or commit messages; restructure with commas, periods, or parentheses instead.
- Every commit message ends with the line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Do not start the app dev server (`npm run dev`); verify through tests and type checks.

---

### Task 1: Server `category-spend` service

**Files:**
- Create: `server/src/services/category-spend.ts`
- Test: `server/src/services/__tests__/category-spend.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `interface SplitShare { amount: number; is_my_share: boolean }`
  - `interface SpendRow { category_id: string | null; amount: number; transaction_type: string | null; is_split: boolean; splits?: SplitShare[] | null }`
  - `getMyShareAmount(t: { amount: number; is_split: boolean; splits?: SplitShare[] | null }): number`
  - `computeCategorySpend(rows: SpendRow[]): Map<string, number>`

- [ ] **Step 1: Write the failing test**

Create `server/src/services/__tests__/category-spend.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getMyShareAmount, computeCategorySpend } from '../category-spend.js';

describe('getMyShareAmount', () => {
  it('returns the absolute amount for an unsplit transaction', () => {
    expect(getMyShareAmount({ amount: 42.5, is_split: false })).toBe(42.5);
  });

  it('returns the absolute amount for a negative unsplit amount', () => {
    expect(getMyShareAmount({ amount: -12, is_split: false })).toBe(12);
  });

  it('sums only my-share splits for a split transaction', () => {
    const t = {
      amount: 100,
      is_split: true,
      splits: [
        { amount: 40, is_my_share: true },
        { amount: 60, is_my_share: false },
      ],
    };
    expect(getMyShareAmount(t)).toBe(40);
  });

  it('returns 0 when all splits belong to others', () => {
    const t = {
      amount: 100,
      is_split: true,
      splits: [{ amount: 100, is_my_share: false }],
    };
    expect(getMyShareAmount(t)).toBe(0);
  });

  it('falls back to the full amount when is_split is true but splits are missing', () => {
    expect(getMyShareAmount({ amount: 80, is_split: true, splits: [] })).toBe(80);
    expect(getMyShareAmount({ amount: 80, is_split: true, splits: null })).toBe(80);
  });
});

describe('computeCategorySpend', () => {
  const row = (overrides: Record<string, unknown>) => ({
    category_id: 'cat-1',
    amount: 0,
    transaction_type: 'expense',
    is_split: false,
    splits: null,
    ...overrides,
  });

  it('sums expenses per category', () => {
    const result = computeCategorySpend([
      row({ amount: 10 }),
      row({ amount: 15 }),
      row({ amount: 5, category_id: 'cat-2' }),
    ]);
    expect(result.get('cat-1')).toBe(25);
    expect(result.get('cat-2')).toBe(5);
  });

  it('nets a return processed BEFORE its matching expense (two-pass fix)', () => {
    const result = computeCategorySpend([
      row({ amount: -20, transaction_type: 'return' }),
      row({ amount: 50 }),
    ]);
    expect(result.get('cat-1')).toBe(30);
  });

  it('clamps a category at zero when returns exceed expenses', () => {
    const result = computeCategorySpend([
      row({ amount: 10 }),
      row({ amount: -25, transaction_type: 'return' }),
    ]);
    expect(result.get('cat-1')).toBe(0);
  });

  it('ignores returns for categories with no expenses', () => {
    const result = computeCategorySpend([
      row({ amount: -25, transaction_type: 'return', category_id: 'cat-9' }),
    ]);
    expect(result.has('cat-9')).toBe(false);
  });

  it('counts only my share of split expenses and split returns', () => {
    const result = computeCategorySpend([
      row({
        amount: 100,
        is_split: true,
        splits: [
          { amount: 30, is_my_share: true },
          { amount: 70, is_my_share: false },
        ],
      }),
      row({
        amount: -50,
        transaction_type: 'return',
        is_split: true,
        splits: [
          { amount: 10, is_my_share: true },
          { amount: 40, is_my_share: false },
        ],
      }),
    ]);
    expect(result.get('cat-1')).toBe(20);
  });

  it('skips rows without a category and ignores other transaction types', () => {
    const result = computeCategorySpend([
      row({ amount: 10, category_id: null }),
      row({ amount: 10, transaction_type: 'transfer' }),
      row({ amount: 10, transaction_type: 'income' }),
      row({ amount: 10, transaction_type: 'investment' }),
    ]);
    expect(result.size).toBe(0);
  });

  it('falls back to sign-based type when transaction_type is null', () => {
    const result = computeCategorySpend([
      row({ amount: 10, transaction_type: null }),
    ]);
    expect(result.get('cat-1')).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `server/`: `npx vitest run src/services/__tests__/category-spend.test.ts`
Expected: FAIL (cannot resolve `../category-spend.js`).

- [ ] **Step 3: Write the implementation**

Create `server/src/services/category-spend.ts`:

```typescript
// Pure helpers (no DB deps) shared by stats and budget-goals routes so
// per-category spending is computed identically everywhere.

export interface SplitShare {
  amount: number;
  is_my_share: boolean;
}

export interface SpendRow {
  category_id: string | null;
  amount: number;
  transaction_type: string | null;
  is_split: boolean;
  splits?: SplitShare[] | null;
}

// The universal "my share" rule: for a split transaction, only splits
// flagged is_my_share count toward my spending; otherwise the full amount.
export function getMyShareAmount(t: {
  amount: number;
  is_split: boolean;
  splits?: SplitShare[] | null;
}): number {
  const splits = t.splits ?? null;
  if (t.is_split && splits && splits.length > 0) {
    return splits
      .filter(s => s.is_my_share)
      .reduce((sum, s) => sum + Math.abs(s.amount), 0);
  }
  return Math.abs(t.amount);
}

// Two-pass netting: accumulate all expenses first, then subtract returns,
// clamped at zero. A single pass would swallow a return that appears
// before its matching expense in the result set.
export function computeCategorySpend(rows: SpendRow[]): Map<string, number> {
  const spent = new Map<string, number>();
  const returns: Array<{ categoryId: string; amount: number }> = [];

  for (const rowItem of rows) {
    if (!rowItem.category_id) continue;
    const type = rowItem.transaction_type || (rowItem.amount > 0 ? 'expense' : 'income');
    if (type === 'expense') {
      const current = spent.get(rowItem.category_id) || 0;
      spent.set(rowItem.category_id, current + getMyShareAmount(rowItem));
    } else if (type === 'return') {
      returns.push({ categoryId: rowItem.category_id, amount: getMyShareAmount(rowItem) });
    }
  }

  for (const ret of returns) {
    const current = spent.get(ret.categoryId);
    if (current !== undefined) {
      spent.set(ret.categoryId, Math.max(0, current - ret.amount));
    }
  }

  return spent;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `server/`: `npx vitest run src/services/__tests__/category-spend.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/category-spend.ts server/src/services/__tests__/category-spend.test.ts
git commit -m "feat: add shared category-spend service with two-pass returns netting

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Budget goals use the shared service (fixes returns-ordering bug)

**Files:**
- Modify: `server/src/routes/budget-goals.ts:49-73`

**Interfaces:**
- Consumes: `computeCategorySpend` and `SpendRow` from Task 1.
- Produces: unchanged route response shape (`spent` per goal), now order-independent.

- [ ] **Step 1: Replace the single-pass block**

In `server/src/routes/budget-goals.ts`, add the import after the existing imports:

```typescript
import { computeCategorySpend, type SpendRow } from '../services/category-spend.js';
```

Then replace the whole "Sum by category" block (the comment at line 49 through the closing `});` of the `forEach` at line 73) with:

```typescript
    // Sum by category via the shared service (split-aware, two-pass returns netting)
    const spentByCategory = computeCategorySpend((transactions || []) as SpendRow[]);
```

The `goalsWithSpent` mapping below it stays exactly as is.

- [ ] **Step 2: Run the server test suite and type check**

Run: `npm test --prefix server`
Expected: PASS (no route tests exist; this confirms nothing else broke).
Run from `server/`: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/budget-goals.ts
git commit -m "fix: budget goal spent no longer swallows returns processed before expenses

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Monthly stats use the shared service

**Files:**
- Modify: `server/src/routes/stats.ts` (monthly handler lines 45-104, `getExpenseAmount` at lines 220-233, and its call sites at lines 335, 391)
- Modify: `server/src/routes/transactions.ts:449-483` (recurring-average my-share duplication)

**Interfaces:**
- Consumes: `getMyShareAmount`, `computeCategorySpend`, `SpendRow`, `SplitShare` from Task 1.
- Produces: unchanged `/api/stats/monthly` response shape. Deliberate behavior change: `total_spent` now nets only my share of split returns (previously the full return amount).

- [ ] **Step 1: Swap in the shared helpers**

In `server/src/routes/stats.ts`:

1. Add the import:

```typescript
import { getMyShareAmount, computeCategorySpend, type SpendRow } from '../services/category-spend.js';
```

2. Delete the private `getExpenseAmount` helper (lines 220-233) and replace its three call sites (monthly line 64, insights lines 335 and 391) with `getMyShareAmount(t)`.

3. In the monthly handler, replace the category accumulation. Delete the `categoryTotals` map declaration, the `returns` array, the category block inside the expense branch (the `const category = ...` through the `categoryTotals.set(...)` else-branch), the `returns.push(...)` line in the return branch, and the whole "Pass 2" loop. The totals pass becomes:

```typescript
    let grossExpenses = 0;
    let totalReturns = 0;
    let totalIncome = 0;
    let totalInvested = 0;

    transactions?.forEach(t => {
      const transactionType = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');

      if (transactionType === 'transfer') return;

      if (transactionType === 'investment') {
        totalInvested += Math.abs(t.amount);
      } else if (transactionType === 'expense') {
        grossExpenses += getMyShareAmount(t);
      } else if (transactionType === 'return') {
        totalReturns += getMyShareAmount(t);
      } else if (transactionType === 'income') {
        totalIncome += Math.abs(t.amount);
      }
    });
```

4. Build `by_category` from the shared service. Insert after the totals pass (the monthly select already joins `category:categories(id, name, color, icon)`):

```typescript
    // Per-category spend via the shared service so the Dashboard hero,
    // budget goals, and this endpoint can never disagree.
    const categoryById = new Map<string, CategoryData>();
    const spendRows: SpendRow[] = (transactions || []).map(t => {
      const category = t.category as unknown as CategoryData | null;
      if (category) categoryById.set(category.id, category);
      return {
        category_id: category?.id ?? null,
        amount: t.amount,
        transaction_type: t.transaction_type,
        is_split: t.is_split,
        splits: t.splits as SpendRow['splits'],
      };
    });
    const spentByCategory = computeCategorySpend(spendRows);

    const byCategory = Array.from(spentByCategory.entries())
      .filter(([, amount]) => amount > 0)
      .map(([id, amount]) => ({ category: categoryById.get(id)!, amount }))
      .sort((a, b) => b.amount - a.amount);
```

5. In the response, replace the old `by_category: Array.from(categoryTotals.values())...` line with `by_category: byCategory,`.

- [ ] **Step 2: DRY the recurring-average logic in transactions.ts**

In `server/src/routes/transactions.ts`, add the import:

```typescript
import { getMyShareAmount, type SplitShare } from '../services/category-spend.js';
```

In the PATCH handler's recurring branch there are two identical hand-rolled my-share blocks (around lines 449-461 for the merchant's transactions and lines 470-482 for the single-transaction fallback). Replace each block of the form:

```typescript
          const splits = t.splits as { amount: number; is_my_share: boolean }[] | null;
          let txAmount: number;
          if (t.is_split && splits && splits.length > 0) {
            txAmount = splits
              .filter(s => s.is_my_share)
              .reduce((sum, s) => sum + Math.abs(s.amount), 0);
          } else {
            txAmount = Math.abs(t.amount);
          }
```

with:

```typescript
          const txAmount = getMyShareAmount({ ...t, splits: t.splits as SplitShare[] | null });
```

(In the fallback block the variable is `thisTx` instead of `t`; apply the same one-liner there.)

- [ ] **Step 3: Run tests and type check**

Run: `npm test --prefix server`
Run from `server/`: `npx tsc --noEmit`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/stats.ts server/src/routes/transactions.ts
git commit -m "refactor: stats and transactions routes use shared category-spend helpers

Split returns now net only my share, matching the insights endpoint.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Pending spend visibility

**Files:**
- Modify: `server/src/routes/stats.ts` (monthly handler select and totals pass from Task 3)
- Modify: `client/src/types/index.ts:131-138` (`MonthlyStats`)
- Modify: `client/src/hooks/useFinancialHealth.ts`
- Modify: `client/src/components/dashboard/DashboardHero.tsx:144-160`

**Interfaces:**
- Consumes: Task 3's monthly handler shape.
- Produces: `/api/stats/monthly` gains `pending_spent: number`; `useFinancialHealth` gains `pendingSpent: number` in its return object.

- [ ] **Step 1: Server: accumulate pending spend**

In the monthly handler's select, add `pending` to the column list (after `is_split,`). Then extend the totals pass from Task 3:

```typescript
    let pendingSpent = 0;
```

and inside the expense branch:

```typescript
      } else if (transactionType === 'expense') {
        const amountToCount = getMyShareAmount(t);
        grossExpenses += amountToCount;
        if (t.pending) pendingSpent += amountToCount;
      }
```

Add to the response object: `pending_spent: pendingSpent,`.

- [ ] **Step 2: Client: type and hook**

In `client/src/types/index.ts`, add to `MonthlyStats`:

```typescript
  pending_spent: number;
```

In `client/src/hooks/useFinancialHealth.ts`, add below `totalInvested`:

```typescript
    const pendingSpent = stats?.pending_spent || 0;
```

and add `pendingSpent,` to the returned object.

- [ ] **Step 3: Client: hero subtext**

In `client/src/components/dashboard/DashboardHero.tsx`, destructure `pendingSpent` from `useFinancialHealth(month, year)`. Then, directly below the existing spent/total footer `div` (the one with `{formatCurrency(totalSpent)} spent`), add:

```tsx
                        {pendingSpent > 0 && (
                            <p className={clsx('text-xs mt-1', accent.subtle)}>
                                includes {formatCurrency(pendingSpent)} pending
                            </p>
                        )}
```

- [ ] **Step 4: Run tests and type checks**

Run: `npm test --prefix server` and `npm test --prefix client`
Run from `server/` and from `client/`: `npx tsc --noEmit`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/stats.ts client/src/types/index.ts client/src/hooks/useFinancialHealth.ts client/src/components/dashboard/DashboardHero.tsx
git commit -m "feat: surface pending spend on the Dashboard hero

Totals are unchanged; the hero now notes how much of the spent figure is pending.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Split mutations invalidate all affected caches

**Files:**
- Modify: `client/src/hooks/useTransactions.ts:51-101`
- Modify: `client/src/hooks/useTags.ts:95-106`

**Interfaces:**
- Consumes: existing hooks.
- Produces: no API change; cache behavior only.

- [ ] **Step 1: Extend the invalidations**

Splitting changes my-share spend, so it must refresh stats, insights, and budget goals (query key `['budget-goals', month, year]` drives the watchlist). In `useTransactions.ts`, change the `onSuccess` of BOTH `useCreateSplit` and `useDeleteSplits` to:

```typescript
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      queryClient.invalidateQueries({ queryKey: ['budget-goals'] });
    },
```

Same defect class while in the file: add `queryClient.invalidateQueries({ queryKey: ['insights'] });` and `queryClient.invalidateQueries({ queryKey: ['budget-goals'] });` to `useCreateManualTransaction` and `useDeleteTransaction` (both currently stop at `['stats']`), and add just `['budget-goals']` to `useUpdateTransaction` (it already has `['insights']`).

In `useTags.ts`, `useBulkSplitTransactions` gets the same four-key set as `useCreateSplit`.

- [ ] **Step 2: Run client tests and type check**

Run: `npm test --prefix client`
Run from `client/`: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useTransactions.ts client/src/hooks/useTags.ts
git commit -m "fix: split and transaction mutations invalidate stats, insights, and budget goals

The Dashboard no longer shows stale totals right after splitting a transaction.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Recurring frequency normalization

**Files:**
- Create: `server/src/services/recurring-normalize.ts`
- Test: `server/src/services/__tests__/recurring-normalize.test.ts`
- Modify: `server/src/routes/stats.ts:258-269` (insights recurring query)

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `monthlyEquivalentAmount(frequency: 'weekly' | 'monthly' | 'yearly', averageAmount: number): number`

- [ ] **Step 1: Write the failing test**

Create `server/src/services/__tests__/recurring-normalize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { monthlyEquivalentAmount } from '../recurring-normalize.js';

describe('monthlyEquivalentAmount', () => {
  it('returns monthly amounts unchanged', () => {
    expect(monthlyEquivalentAmount('monthly', 50)).toBe(50);
  });

  it('scales weekly amounts by 52/12', () => {
    expect(monthlyEquivalentAmount('weekly', 12)).toBeCloseTo(52, 5);
  });

  it('divides yearly amounts by 12', () => {
    expect(monthlyEquivalentAmount('yearly', 120)).toBe(10);
  });

  it('handles zero', () => {
    expect(monthlyEquivalentAmount('weekly', 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `server/`: `npx vitest run src/services/__tests__/recurring-normalize.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `server/src/services/recurring-normalize.ts`:

```typescript
// Pure helper: convert a recurring charge's average amount to its
// monthly equivalent so weekly and yearly charges contribute correctly
// to expected fixed costs.

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';

const WEEKS_PER_MONTH = 52 / 12;

export function monthlyEquivalentAmount(
  frequency: RecurringFrequency,
  averageAmount: number,
): number {
  switch (frequency) {
    case 'weekly':
      return averageAmount * WEEKS_PER_MONTH;
    case 'yearly':
      return averageAmount / 12;
    case 'monthly':
    default:
      return averageAmount;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `server/`: `npx vitest run src/services/__tests__/recurring-normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it in the insights handler**

In `server/src/routes/stats.ts`, add the import:

```typescript
import { monthlyEquivalentAmount, type RecurringFrequency } from '../services/recurring-normalize.js';
```

Replace the recurring query block (currently filtering `.eq('frequency', 'monthly')`) with:

```typescript
    // ── Query all active recurring charges (any frequency) ────────────
    const { data: recurringCharges } = await supabase
      .from('recurring_transactions')
      .select('merchant_display_name, average_amount, frequency')
      .eq('is_active', true);

    const recurringMerchants = new Set(
      (recurringCharges || []).map(r => r.merchant_display_name)
    );
    const expectedFixedCosts = (recurringCharges || [])
      .reduce((sum, r) => sum + monthlyEquivalentAmount(r.frequency as RecurringFrequency, r.average_amount), 0);
```

A yearly charge contributes 1/12 to expected fixed costs but its full amount to recurring spend in its billing month; the existing `Math.max(0, expected - spent)` clamp in `spending-velocity.ts` absorbs that without double counting.

- [ ] **Step 6: Run tests, type check, commit**

Run: `npm test --prefix server`; from `server/`: `npx tsc --noEmit`. Expected: clean.

```bash
git add server/src/services/recurring-normalize.ts server/src/services/__tests__/recurring-normalize.test.ts server/src/routes/stats.ts
git commit -m "fix: count weekly and yearly recurring charges in fixed costs and pace projection

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Client my-share util and DRY refactor

**Files:**
- Create: `client/src/utils/my-share.ts`
- Test: `client/src/utils/__tests__/my-share.test.ts` (new directory)
- Modify: `client/src/pages/Transactions.tsx:181-184`
- Modify: `client/src/components/dashboard/DailySpending.tsx:44-54`
- Modify: `client/src/components/transactions/TransactionRow.tsx:69-79`

**Interfaces:**
- Consumes: `Transaction` type from `client/src/types`.
- Produces: `getMyShareAmount(t: Pick<Transaction, 'amount' | 'is_split' | 'splits'>): number` (used by the three refactored call sites in this task).

- [ ] **Step 1: Write the failing test**

Create `client/src/utils/__tests__/my-share.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getMyShareAmount } from '../my-share';

const split = (amount: number, isMyShare: boolean) => ({
  id: 's',
  parent_transaction_id: 'p',
  amount,
  description: '',
  is_my_share: isMyShare,
  created_at: '',
});

describe('getMyShareAmount', () => {
  it('returns the absolute amount for an unsplit transaction', () => {
    expect(getMyShareAmount({ amount: -33, is_split: false, splits: undefined })).toBe(33);
  });

  it('sums only my-share splits', () => {
    expect(
      getMyShareAmount({ amount: 100, is_split: true, splits: [split(40, true), split(60, false)] })
    ).toBe(40);
  });

  it('returns 0 when all splits belong to others (matches server semantics)', () => {
    expect(
      getMyShareAmount({ amount: 100, is_split: true, splits: [split(100, false)] })
    ).toBe(0);
  });

  it('falls back to the full amount when splits are missing or empty', () => {
    expect(getMyShareAmount({ amount: 80, is_split: true, splits: [] })).toBe(80);
    expect(getMyShareAmount({ amount: 80, is_split: true, splits: undefined })).toBe(80);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `client/`: `npx vitest run src/utils/__tests__/my-share.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `client/src/utils/my-share.ts`:

```typescript
import type { Transaction } from '../types';

// The universal "my share" rule, mirroring the server's category-spend
// service: for a split transaction only is_my_share splits count toward
// my spending, including when that sum is zero.
export const getMyShareAmount = (
  t: Pick<Transaction, 'amount' | 'is_split' | 'splits'>,
): number => {
  if (t.is_split && t.splits && t.splits.length > 0) {
    return t.splits
      .filter(s => s.is_my_share)
      .reduce((sum, s) => sum + Math.abs(s.amount), 0);
  }
  return Math.abs(t.amount);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run from `client/`: `npx vitest run src/utils/__tests__/my-share.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor the three call sites**

1. `client/src/pages/Transactions.tsx`: import `getMyShareAmount` from `'../utils/my-share'`, then in the `totals` reducer replace the hand-rolled ternary (`const amount = t.is_split && t.splits?.length ? ... : Math.abs(t.amount);`) with:

```typescript
        const amount = getMyShareAmount(t);
```

2. `client/src/components/dashboard/DailySpending.tsx`: import `getMyShareAmount` from `'../../utils/my-share'`, then replace the whole "Helper to calculating amount" block (the `let amount = ...` through the `if (myShare > 0) amount = myShare;` closing brace) with:

```typescript
            const amount = getMyShareAmount(t);
```

This is a deliberate behavior fix: a transaction whose splits are all someone else's share now contributes 0, matching the server, instead of falling back to the full amount.

3. `client/src/components/transactions/TransactionRow.tsx`: import `getMyShareAmount` from `'../../utils/my-share'`, then replace the `myShare` / `displayAmount` / `totalAmount` / `showSplitTotal` block with:

```typescript
  const totalAmount = Math.abs(transaction.amount);
  const displayAmount = getMyShareAmount(transaction);
  const showSplitTotal = transaction.is_split && displayAmount !== totalAmount;
```

- [ ] **Step 6: Run all client tests and type check**

Run: `npm test --prefix client`; from `client/`: `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add client/src/utils/my-share.ts client/src/utils/__tests__/my-share.test.ts client/src/pages/Transactions.tsx client/src/components/dashboard/DailySpending.tsx client/src/components/transactions/TransactionRow.tsx
git commit -m "refactor: extract client my-share util, align DailySpending split semantics with server

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Refresh stale Database types

**Files:**
- Modify: `server/src/db/supabase.ts:30-67`

**Interfaces:**
- Consumes / Produces: type definitions only, no runtime change.

- [ ] **Step 1: Add the missing fields**

In the `Database` type, extend `transactions` with:

```typescript
    original_description: string | null;
    transaction_type: 'income' | 'expense' | 'transfer' | 'investment' | 'return';
    needs_review: boolean;
    pending: boolean;
    plaid_category: { primary?: string; detailed?: string } | null;
```

and extend `transaction_splits` with:

```typescript
    is_my_share: boolean;
```

- [ ] **Step 2: Type check, test, commit**

Run from `server/`: `npx tsc --noEmit`; then `npm test --prefix server`. Expected: clean.

```bash
git add server/src/db/supabase.ts
git commit -m "chore: refresh hand-maintained Database types with missing columns

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Migrate stats routes to asyncHandler

**Files:**
- Modify: `server/src/routes/stats.ts` (all four handlers)

**Interfaces:**
- Consumes: `asyncHandler` from `server/src/utils/asyncHandler.js`.
- Produces: no response shape change. Error responses change from per-route messages to the global handler's `{ message: 'Internal server error' }`, which is the project convention.

- [ ] **Step 1: Wrap the handlers**

Add the import:

```typescript
import { asyncHandler } from '../utils/asyncHandler.js';
```

For each of the four routes (`/monthly`, `/yearly`, `/insights`, `/estimated-income`): change `router.get('/path', async (req, res) => {` to `router.get('/path', asyncHandler(async (req, res) => {`, delete the `try {` line and the entire `} catch (error) { ... }` block, and close with `}));`. Keep all body code and early `return res.status(400)...` guards unchanged.

- [ ] **Step 2: Test, type check, commit**

Run: `npm test --prefix server`; from `server/`: `npx tsc --noEmit`. Expected: clean.

```bash
git add server/src/routes/stats.ts
git commit -m "refactor: stats routes use asyncHandler like every other route file

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Budget variance util

**Files:**
- Create: `client/src/utils/budget-variance.ts`
- Test: `client/src/utils/__tests__/budget-variance.test.ts`

**Interfaces:**
- Consumes: `BudgetGoal`, `MonthlyStats` types.
- Produces:
  - `interface CategoryVariance { categoryId: string; categoryName: string; spent: number; limit: number; overage: number }`
  - `interface BudgetVarianceResult { overspentCategories: CategoryVariance[]; unbudgetedSpend: number; totalBudgeted: number; totalOverage: number }`
  - `computeBudgetVariance(goals: BudgetGoal[], byCategory: MonthlyStats['by_category']): BudgetVarianceResult`

- [ ] **Step 1: Write the failing test**

Create `client/src/utils/__tests__/budget-variance.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeBudgetVariance } from '../budget-variance';
import type { BudgetGoal, Category } from '../../types';

const category = (id: string, name: string): Category => ({
  id, name, icon: 'tag', color: '#fff', is_default: false,
});

const goal = (categoryId: string, name: string, limit: number, spent: number): BudgetGoal => ({
  id: `goal-${categoryId}`,
  category_id: categoryId,
  month: 7,
  year: 2026,
  limit_amount: limit,
  created_at: '',
  category: category(categoryId, name),
  spent,
});

describe('computeBudgetVariance', () => {
  it('ranks overspent categories by overage descending', () => {
    const result = computeBudgetVariance(
      [
        goal('c1', 'Dining', 450, 580),
        goal('c2', 'Groceries', 400, 390),
        goal('c3', 'Travel', 100, 400),
      ],
      []
    );
    expect(result.overspentCategories.map(c => c.categoryName)).toEqual(['Travel', 'Dining']);
    expect(result.overspentCategories[0].overage).toBe(300);
    expect(result.totalOverage).toBe(430);
    expect(result.totalBudgeted).toBe(950);
  });

  it('sums spending in categories that have no goal', () => {
    const result = computeBudgetVariance(
      [goal('c1', 'Dining', 450, 100)],
      [
        { category: category('c1', 'Dining'), amount: 100 },
        { category: category('c9', 'Pets'), amount: 75 },
        { category: category('c8', 'Gifts'), amount: 25 },
      ]
    );
    expect(result.unbudgetedSpend).toBe(100);
    expect(result.overspentCategories).toEqual([]);
  });

  it('handles no goals at all', () => {
    const result = computeBudgetVariance([], [{ category: category('c9', 'Pets'), amount: 75 }]);
    expect(result.overspentCategories).toEqual([]);
    expect(result.unbudgetedSpend).toBe(75);
    expect(result.totalBudgeted).toBe(0);
  });

  it('treats missing spent as zero', () => {
    const g = goal('c1', 'Dining', 450, 0);
    delete (g as { spent?: number }).spent;
    const result = computeBudgetVariance([g], []);
    expect(result.overspentCategories).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `client/`: `npx vitest run src/utils/__tests__/budget-variance.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `client/src/utils/budget-variance.ts`:

```typescript
import type { BudgetGoal, MonthlyStats } from '../types';

export interface CategoryVariance {
  categoryId: string;
  categoryName: string;
  spent: number;
  limit: number;
  overage: number;
}

export interface BudgetVarianceResult {
  overspentCategories: CategoryVariance[];
  unbudgetedSpend: number;
  totalBudgeted: number;
  totalOverage: number;
}

// Answers "what put me over this month?": categories past their limit
// ranked by overage, plus spending in categories with no budget at all
// (invisible on the Plan page but still counted in the hero total).
export function computeBudgetVariance(
  goals: BudgetGoal[],
  byCategory: MonthlyStats['by_category'],
): BudgetVarianceResult {
  const overspentCategories = goals
    .filter(g => (g.spent || 0) > g.limit_amount)
    .map(g => ({
      categoryId: g.category_id,
      categoryName: g.category?.name || 'Unknown',
      spent: g.spent || 0,
      limit: g.limit_amount,
      overage: (g.spent || 0) - g.limit_amount,
    }))
    .sort((a, b) => b.overage - a.overage);

  const budgetedIds = new Set(goals.map(g => g.category_id));
  const unbudgetedSpend = byCategory
    .filter(c => !budgetedIds.has(c.category.id))
    .reduce((sum, c) => sum + c.amount, 0);

  return {
    overspentCategories,
    unbudgetedSpend,
    totalBudgeted: goals.reduce((sum, g) => sum + g.limit_amount, 0),
    totalOverage: overspentCategories.reduce((sum, c) => sum + c.overage, 0),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `client/`: `npx vitest run src/utils/__tests__/budget-variance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/budget-variance.ts client/src/utils/__tests__/budget-variance.test.ts
git commit -m "feat: add budget variance computation for the month review card

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: BudgetVariance card on the Dashboard

**Files:**
- Create: `client/src/components/dashboard/BudgetVariance.tsx`
- Modify: `client/src/pages/Dashboard.tsx:76-86`

**Interfaces:**
- Consumes: `computeBudgetVariance` from Task 10, `useBudgetGoals` and `useMonthlyStats` from `hooks`, `formatCurrency`, `Card` from `../ui`.
- Produces: `<BudgetVariance month={number} year={number} />`.

- [ ] **Step 1: Create the component**

Create `client/src/components/dashboard/BudgetVariance.tsx`:

```tsx
import { TrendingUp, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../ui';
import { useBudgetGoals, useMonthlyStats } from '../../hooks';
import { computeBudgetVariance } from '../../utils/budget-variance';
import { formatCurrency } from '../../utils/formatters';

interface BudgetVarianceProps {
    month: number;
    year: number;
}

const MAX_ROWS = 5;

export const BudgetVariance = ({ month, year }: BudgetVarianceProps) => {
    const { data: budgetGoals } = useBudgetGoals(month, year);
    const { data: monthlyStats } = useMonthlyStats(month, year);

    // Variance needs per-category limits; hidden while loading, with no
    // goals, or when nothing is over (matches BudgetWatchlist behavior).
    if (!budgetGoals || !monthlyStats || budgetGoals.length === 0) return null;

    const variance = computeBudgetVariance(budgetGoals, monthlyStats.by_category);
    const overTotal = monthlyStats.total_spent > variance.totalBudgeted;
    if (variance.overspentCategories.length === 0 && !overTotal) return null;

    const shown = variance.overspentCategories.slice(0, MAX_ROWS);
    const hiddenCount = variance.overspentCategories.length - shown.length;

    return (
        <Card className="flex flex-col" padding="none">
            <div className="p-4 border-b border-midnight-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-rose-400" />
                    <h3 className="font-medium text-slate-100">Why over budget?</h3>
                </div>
                <Link to="/plan" className="text-sm text-accent-400 hover:text-accent-300 flex items-center gap-1">
                    Manage <ArrowRight className="h-3 w-3" />
                </Link>
            </div>

            <div className="p-4 space-y-3">
                {shown.map(c => (
                    <div key={c.categoryId} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-200">{c.categoryName}</span>
                        <span className="text-slate-400">
                            {formatCurrency(c.spent)} of {formatCurrency(c.limit)}
                            <span className="ml-2 font-semibold text-rose-400">+{formatCurrency(c.overage)}</span>
                        </span>
                    </div>
                ))}
                {hiddenCount > 0 && (
                    <p className="text-xs text-slate-500">+{hiddenCount} more over-limit categories</p>
                )}
                {shown.length === 0 && (
                    <p className="text-sm text-slate-400">
                        No single category is over its limit, but total spending exceeds the overall budget.
                    </p>
                )}
                {variance.unbudgetedSpend > 0 && (
                    <div className="flex items-center justify-between text-sm pt-3 border-t border-midnight-700">
                        <span className="font-medium text-slate-200">Unbudgeted categories</span>
                        <span className="font-semibold text-amber-400">{formatCurrency(variance.unbudgetedSpend)}</span>
                    </div>
                )}
            </div>
        </Card>
    );
};
```

- [ ] **Step 2: Wire into the Dashboard**

In `client/src/pages/Dashboard.tsx`, import the component:

```typescript
import { BudgetVariance } from '../components/dashboard/BudgetVariance';
```

and render it as the FIRST child of the left column (before `<DailySpending ... />`):

```tsx
          <BudgetVariance
            month={currentDate.month}
            year={currentDate.year}
          />
```

- [ ] **Step 3: Run tests and type check**

Run: `npm test --prefix client`; from `client/`: `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/dashboard/BudgetVariance.tsx client/src/pages/Dashboard.tsx
git commit -m "feat: add budget variance card explaining monthly overage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: LargeUnsplitTransactions card

**Files:**
- Modify: `client/src/utils/constants.ts` (add threshold constant near the top-level exports)
- Create: `client/src/components/dashboard/LargeUnsplitTransactions.tsx`
- Modify: `client/src/pages/Dashboard.tsx:102-105`

**Interfaces:**
- Consumes: `useTransactions` filters `{ month, year, transaction_type: 'expense' }`, `useModalState<Transaction>()` (returns `{ isOpen, item, open, edit, close }`), `SplitTransactionModal` props `{ isOpen: boolean; onClose: () => void; transaction: Transaction | null }`, `formatCurrency`, `formatDate`.
- Produces: `<LargeUnsplitTransactions month={number} year={number} />` and `LARGE_UNSPLIT_THRESHOLD` constant.

- [ ] **Step 1: Add the constant**

In `client/src/utils/constants.ts` add:

```typescript
// Unsplit expenses at or above this amount surface in the Dashboard's
// "Possible missed splits" card.
export const LARGE_UNSPLIT_THRESHOLD = 100;
```

- [ ] **Step 2: Create the component**

Create `client/src/components/dashboard/LargeUnsplitTransactions.tsx`:

```tsx
import { Scissors } from 'lucide-react';
import { Card, Button } from '../ui';
import { useTransactions, useModalState } from '../../hooks';
import { SplitTransactionModal } from '../transactions/SplitTransactionModal';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { LARGE_UNSPLIT_THRESHOLD } from '../../utils/constants';
import type { Transaction } from '../../types';

interface LargeUnsplitTransactionsProps {
    month: number;
    year: number;
}

const MAX_ROWS = 5;

export const LargeUnsplitTransactions = ({ month, year }: LargeUnsplitTransactionsProps) => {
    const { data: transactions } = useTransactions({ month, year, transaction_type: 'expense' });
    const splitModal = useModalState<Transaction>();

    const candidates = (transactions || [])
        .filter(t => !t.is_split && Math.abs(t.amount) >= LARGE_UNSPLIT_THRESHOLD)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    if (candidates.length === 0) return null;

    const shown = candidates.slice(0, MAX_ROWS);
    const hiddenCount = candidates.length - shown.length;

    return (
        <>
            <Card className="flex flex-col" padding="none">
                <div className="p-4 border-b border-midnight-700 flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-accent-400" />
                    <h3 className="font-medium text-slate-100">Possible missed splits</h3>
                </div>
                <div className="p-4 space-y-3">
                    <p className="text-xs text-slate-400">
                        Large expenses ({formatCurrency(LARGE_UNSPLIT_THRESHOLD)}+) that haven't been split.
                    </p>
                    {shown.map(t => (
                        <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                            <div className="min-w-0">
                                <p className="font-medium text-slate-200 truncate">
                                    {t.merchant_display_name || t.merchant_name}
                                </p>
                                <p className="text-xs text-slate-500">{formatDate(t.date)}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="font-semibold text-slate-100">
                                    {formatCurrency(Math.abs(t.amount))}
                                </span>
                                <Button variant="ghost" size="sm" onClick={() => splitModal.edit(t)}>
                                    Split
                                </Button>
                            </div>
                        </div>
                    ))}
                    {hiddenCount > 0 && (
                        <p className="text-xs text-slate-500">+{hiddenCount} more above the threshold</p>
                    )}
                </div>
            </Card>

            <SplitTransactionModal
                isOpen={splitModal.isOpen}
                onClose={splitModal.close}
                transaction={splitModal.item}
            />
        </>
    );
};
```

- [ ] **Step 3: Wire into the Dashboard**

In `client/src/pages/Dashboard.tsx`, import the component:

```typescript
import { LargeUnsplitTransactions } from '../components/dashboard/LargeUnsplitTransactions';
```

and render it in the right column directly after `<BudgetWatchlist ... />` (inside the same inner grid `div`):

```tsx
            <LargeUnsplitTransactions
              month={currentDate.month}
              year={currentDate.year}
            />
```

- [ ] **Step 4: Run tests and type check**

Run: `npm test --prefix client`; from `client/`: `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/constants.ts client/src/components/dashboard/LargeUnsplitTransactions.tsx client/src/pages/Dashboard.tsx
git commit -m "feat: surface large unsplit transactions on the Dashboard

Directly targets missed splits on large shared expenses.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suites**

Run: `npm test --prefix server` and `npm test --prefix client`.
Expected: all tests pass, including the new category-spend, recurring-normalize, my-share, and budget-variance suites.

- [ ] **Step 2: Type checks and production build**

Run from `server/`: `npx tsc --noEmit`. Run from `client/`: `npx tsc --noEmit`. Run at repo root: `npm run build`.
Expected: no errors.

- [ ] **Step 3: Review the full branch diff**

Run: `git log --oneline main..HEAD` and `git diff main...HEAD --stat`.
Check against the spec: every Phase 1 fix (1.1 through 1.5), both Phase 2 cards, and the cleanup items. Confirm no unrelated files changed and no dev servers were started.

- [ ] **Step 4: Report**

Summarize what changed, note the two deliberate behavior changes (split-aware returns in monthly totals; all-others splits contribute 0 in DailySpending), and remind that manual visual verification of the two new cards happens when the user next runs `npm run dev`.
