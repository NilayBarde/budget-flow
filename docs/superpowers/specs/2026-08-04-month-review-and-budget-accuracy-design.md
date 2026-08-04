# Month Review and Budget Accuracy

**Date:** 2026-08-04
**Status:** Draft, awaiting user approval

## Problem

At the end of a month the user is often over budget without a clear explanation. Two root causes:

1. **The numbers themselves are partly untrustworthy.** Five measurement defects distort the over-budget signal (detailed in Phase 1).
2. **Nothing explains the overage.** There is no view ranking which categories blew past their limits, no visibility into spending in unbudgeted categories, and no prompt to catch large shared transactions that were never split (missed splits inflate "my" spending, and they are usually large transactions).

## Scope

Two phases, one branch each, shippable independently.

- **Phase 1: measurement accuracy.** Fix the five defects so every number on the Dashboard is honest.
- **Phase 2: Month Review.** Two new Dashboard cards: a budget variance breakdown ("what put me over") and a large unsplit transactions list ("what I probably forgot to split").

**Out of scope** (candidate follow-ups, in rough priority order): merchant-history split suggestions ("you split 8 of 9 prior charges here"), an `always_split` preference on `merchant_mappings`, recurring price-creep detection (actual vs `average_amount`), parameterizing `/api/stats/insights` for past months, excluding pending transactions from totals.

No schema changes in either phase. No new endpoints.

## Phase 1: measurement accuracy

### 1.1 Shared category-spend service (fixes returns bug and hero/watchlist divergence)

`server/src/routes/budget-goals.ts:50-73` nets returns against expenses in a single pass with `Math.max(0, current - amount)` per operation, so a return processed before its matching expense is swallowed and the category's `spent` is overstated. `stats.ts:51-93` already fixed this with a two-pass approach, but the logic is duplicated, which is also why the hero total and the watchlist can disagree.

**Change:** extract a pure service `server/src/services/category-spend.ts`:

- `getMyShareAmount(txn)`: the split-aware amount rule (if `is_split` with splits, sum `is_my_share` split amounts, else `Math.abs(amount)`). This replaces the private `getExpenseAmount` in `stats.ts:221-233`.
- `computeCategorySpend(transactions)`: two-pass netting (pass 1 accumulates expenses per category, pass 2 subtracts returns, clamped at 0), returning `Map<categoryId, number>`.

Both `stats.ts` (monthly `by_category`) and `budget-goals.ts` (`spent`) consume this service, so per-category numbers agree by construction.

**Deliberate behavior change:** `/api/stats/monthly` currently computes `totalReturns` from the full `Math.abs(t.amount)` even for split returns (`stats.ts:77`), while the insights endpoint is split-aware for returns (`stats.ts:391`). The shared service standardizes on split-aware returns everywhere; only "my share" of a split refund nets against spending.

Tests: `server/src/services/__tests__/category-spend.test.ts` covering return-before-expense ordering, split expenses, split returns, clamping at zero, and uncategorized transactions.

### 1.2 Pending spend visibility

Pending transactions are counted in every total and can later change or vanish, creating phantom overage. Excluding them would understate real spending, so the math stays unchanged; instead, surface them.

**Change:** `/api/stats/monthly` adds `pending_spent` (sum of my-share expense amounts where `pending = true`; the query gains the `pending` column). `DashboardHero` shows a small "includes $X pending" subtext when the value is positive. Client type `MonthlyStats` gains the field.

### 1.3 Split mutations invalidate stats

`useCreateSplit` and `useDeleteSplits` (`client/src/hooks/useTransactions.ts:75-101`) invalidate only `['transactions']`, so the Dashboard shows stale totals immediately after splitting. Per project convention, mutations must cascade-invalidate.

**Change:** both hooks (and the bulk split hook) also invalidate `['stats']` and `['insights']`. While in the file, add the missing `['insights']` invalidation to `useDeleteTransaction` and `useCreateManualTransaction`, which already invalidate `['stats']` (same defect class).

### 1.4 Recurring frequency normalization

`stats.ts:258-263` loads only `frequency = 'monthly'` recurring rows, so weekly and yearly recurring charges are treated as variable spend, skewing the fixed-cost figure and the pace projection.

**Change:** load all active recurring rows. A pure helper `monthlyEquivalentAmount(frequency, averageAmount)` converts to a monthly figure (weekly times 52/12, monthly unchanged, yearly divided by 12) for `expectedFixedCosts`. All recurring merchants (any frequency) join the `recurringMerchants` set so their charges count as recurring spend, not variable. Known acceptable effect: a yearly charge contributes 1/12 to expected fixed costs but its full amount to `recurringSpent` in its billing month; the existing `Math.max(0, expected - spent)` clamp in `spending-velocity.ts` already handles that without double counting.

Tests: helper unit tests; extend the existing spending-velocity or a new stats-oriented test where practical.

### 1.5 Client split-amount consistency

`DailySpending.tsx:46-54` falls back to the full transaction amount when all splits belong to others (`if (myShare > 0)`), while the server yields 0 in that case.

**Change:** align the component to server semantics (a transaction whose splits are all someone else's share contributes 0). Implemented via the shared client util below.

## Cleanups along the way (user-requested)

Applied opportunistically to code this work already touches, keeping each phase's diff reviewable:

- **DRY the my-share rule on the client.** The split-aware amount logic is hand-rolled in `Transactions.tsx:182-184` (header totals), `DailySpending.tsx:46-54`, and `TransactionRow.tsx:70-79`. Extract one `getMyShareAmount(transaction)` util in `client/src/utils/` and use it in all three plus the new Phase 2 cards. This is the client twin of the 1.1 server service and is what fixes 1.5.
- **DRY the my-share rule on the server.** Covered by 1.1: `stats.ts` (three call sites) and `budget-goals.ts` and the recurring-average logic in `transactions.ts:450-479` all move to `category-spend.ts` helpers where straightforward.
- **Refresh stale hand-maintained `Database` types** in `server/src/db/supabase.ts`: `transaction_splits` is missing `is_my_share`; `transactions` is missing `transaction_type`, `needs_review`, `pending`, `plaid_category`, `original_description`.
- **Convention alignment in touched routes:** `stats.ts` is the only route file using raw try/catch instead of the project-standard `asyncHandler`; migrate its handlers while editing the file.

Not included (would be unrelated refactoring): removing the dead `transactions.parent_transaction_id` column, the unused client `CATEGORY_PATTERNS` map, and the `FOOD_AND_DRINK_BAR` mapping to a nonexistent category. Listed here so they are on record.

## Phase 2: Month Review

Two new cards on the Dashboard, both respecting the month selector (the `GET /transactions` route already accepts `month`/`year`).

### 2.1 Budget variance card ("Why over budget?")

**Component:** `client/src/components/dashboard/BudgetVariance.tsx`, placed in the left Dashboard column directly below `DashboardHero`'s grid position (above `DailySpending`).

**Data:** joins two existing queries client-side, `useBudgetGoals(month, year)` and `useMonthlyStats(month, year)`. After Phase 1 both sides use the same computation, so the join is consistent.

**Computation:** pure util `client/src/utils/budget-variance.ts`:

- For each goal: `variance = spent - limit_amount`. Keep positive variances, sort descending.
- `unbudgetedSpend`: sum of `by_category` amounts whose category has no goal for the month.
- Returns `{ overspentCategories, unbudgetedSpend, totalOverage }`.

**Display rules:**

- Card renders only when the month has at least one category goal and (`totalSpent > totalBudgeted` or any category is over its limit). Otherwise it returns `null`, like `BudgetWatchlist`.
- Rows: category name, "$spent of $limit", and the overage amount in rose (e.g. "+$142"). Top 5 by overage.
- Final row when `unbudgetedSpend > 0`: "Unbudgeted categories: $X" with a link to the Plan page.
- When the manual `monthly_budget_limit` override is set but no category goals exist, the card stays hidden (variance requires per-category limits).

Tests: `budget-variance` util unit tests (over/under mix, no goals, unbudgeted-only overage).

### 2.2 Large unsplit transactions card ("Possible missed splits")

**Component:** `client/src/components/dashboard/LargeUnsplitTransactions.tsx`, placed in the right Dashboard column below `BudgetWatchlist`.

**Data:** `useTransactions({ month, year, transaction_type: 'expense' })`, filtered client-side to `!is_split` and my-share amount at or above `LARGE_UNSPLIT_THRESHOLD` (new constant in `client/src/utils/constants.ts`, value 100). Sorted by amount descending, top 5, with a "+N more" count when truncated.

**Display:** each row shows merchant display name, date, amount, and a Split button that opens the existing `SplitTransactionModal` (state via the existing `useModalState` hook). Card returns `null` when nothing matches. Splitting a transaction removes it from the list on refetch (guaranteed by the 1.3 invalidation fix).

No server changes.

## Error handling

No new failure modes: both cards rely on existing React Query hooks and render nothing while loading or on error, matching `BudgetWatchlist`. Server changes keep existing error paths (`asyncHandler` for budget-goals; stats.ts keeps its try/catch style).

## Testing summary

- Server: new `category-spend` service tests; `monthlyEquivalentAmount` tests; existing spending-velocity tests must stay green.
- Client: `budget-variance` util tests; existing test suites stay green.
- Manual verification: Dashboard against a month with returns, splits, pending charges, and an over-limit category; confirm hero, watchlist, and variance card agree.

## Follow-up ideas parked

Merchant-history split suggestions, `always_split` merchant preference, recurring price-creep list, past-month insights. Each builds on the patterns this work establishes (shared spend service, review-style Dashboard cards).
