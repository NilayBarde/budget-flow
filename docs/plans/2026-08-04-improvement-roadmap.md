# BudgetFlow Improvement Roadmap (2026-08-04)

Five independently planned workstreams, compiled and sequenced. Each phase was planned by a dedicated architect agent against verified file locations. Roughly 27 commits total across 4 phases plus one small independent task.

## Decisions needed before starting (flagged, with recommendations)

1. **Savings goals: delete or re-land?** Recommendation: **delete**. Goals have no account/transaction linkage (every dollar manually entered, goes stale), the Net Worth goal card answers the same question from real synced data with better math, and the feature has been orphaned since February without being missed. A short re-land plan exists if overruled (Phase 3b alternative).
2. **Settings "Data Management" card**: Recommendation: **implement Export All Data (~50 lines), delete the Clear All Data button.** A JSON export has real backup/portability value for a finance app; a destructive clear is redundant for a single user with Supabase console access.
3. **Destructive migrations** (drop `savings_goals`, `holdings`, `securities`, two `accounts` columns): each has a pre-flight `SELECT` to eyeball data first. Run manually in the Supabase SQL editor, only after the corresponding code removal ships.

## Migration number assignments (three plans collided on 021)

| # | Migration | Phase |
|---|---|---|
| 021 | `add_splits_tags_indexes.sql` (indexes on `transaction_splits(parent_transaction_id)`, `transaction_tags(tag_id)`) | 1 |
| 022 | `restore_app_settings_keys.sql` (fixes the 016/020 contradiction; re-seed `expected_monthly_income`) | 3 |
| 023 | `remove_savings_goals.sql` (**DESTRUCTIVE**: drop table) | 3b |
| 024 | `drop_orphaned_investment_and_balance_alert_objects.sql` (**DESTRUCTIVE**: drop `holdings`, `securities`, `accounts.balance_threshold`, `accounts.last_balance_alert_at`) | 3 |
| — | Regenerate `supabase-schema.sql` baseline afterwards (dump live schema; update README setup step) | 3, last |

Check `ls migrations/` before creating each file in case numbering moved.

## Sequencing and interactions

- **Phase 1 before Phase 2**: both touch `Transactions.tsx` header totals. Phase 1 extracts the existing reducer verbatim into `client/src/utils` (commit 1.4); Phase 2 later replaces its internals with the canonical split-aware math and switches the unfiltered case to `/stats/monthly` (commit 2.7). Done in this order there is no rework, just a follow-on edit to one util.
- **Phase 1 commit 1.2 is also a security fix** (stops shipping `plaid_access_token`/`plaid_cursor` to the browser) — do it early regardless of other ordering.
- Phase 3 cleanup edits `useTransactions.ts` (deleting dead hooks); Phase 1 edits the same file (adding `placeholderData`). Trivial merge either order; roadmap order avoids it entirely.
- Phase 4 (year picker) is fully independent; do it anytime.
- The spent-math changes (Phase 2) will visibly shift some numbers **because they fix bugs**: split returns currently over-net `/monthly` and `/yearly` totals; budget goals can swallow returns and exclude null-type transactions; DailySpending inflates days containing splits with zero my-share. Baselines are captured first (commit 2.0) so every changed number is explained.

---

# Phase 1 — Perf + trust batch (7 commits)

**Verified context**: React Query `^5.90.16` (v5 API: `placeholderData: keepPreviousData`, not the v4 boolean). FK column `transaction_splits.parent_transaction_id` confirmed unindexed. `transaction_tags` PK `(transaction_id, tag_id)` covers transaction_id lookups only. Client consumes only `account.institution_name`, `category.{name,color}`, `tags.{id,name,color}`, all split columns.

### 1.1 — Migration 021: indexes
`migrations/021_add_splits_tags_indexes.sql`:
```sql
CREATE INDEX IF NOT EXISTS idx_transaction_splits_parent_transaction_id
  ON transaction_splits(parent_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag_id
  ON transaction_tags(tag_id);
```
Do NOT index `transaction_tags(transaction_id)` (covered by PK). Verify with `pg_indexes` query and `EXPLAIN ANALYZE` before/after.

### 1.2 — Server: trim GET /api/transactions payload + single-query tags (SECURITY FIX)
In `server/src/routes/transactions.ts` replace the select with explicit embeds and add tags to the same query:
```
*, account:accounts(id, institution_name, account_name),
category:categories(id, name, icon, color),
splits:transaction_splits(id, parent_transaction_id, amount, description, is_my_share, created_at),
tags:tags(id, name, color)
```
- `tags:tags(...)` relies on PostgREST junction detection returning a flat `Tag[]`. Fallback if the relationship isn't resolved: `tags:transaction_tags(tag:tags(id,name,color))` + JS flatten.
- Delete the sequential tags fetch/attach block (~lines 65-97). Keep `tag_id` filtering in JS against the embedded data (moving it to `tags!inner` would strip non-matching tags from the embed).
- **This stops shipping `plaid_access_token` and `plaid_cursor` to the browser** — call out in the commit message.
- Extract the tag filter into a pure tested helper (repo pattern: pure service logic gets vitest coverage).

Verify: `curl ... | jq '.[0].account | keys'` → exactly `[account_name, id, institution_name]`; payload size before/after; one PostgREST request instead of two; tag filter still works; UI rows/modals render tags and splits.

### 1.3 — Client: keepPreviousData + 300ms debounced search
- `useTransactions.ts`: add `placeholderData: keepPreviousData` (import from `@tanstack/react-query`).
- New `client/src/hooks/useDebouncedValue.ts` (+ fake-timer tests). Debounce at the **page** level in `Transactions.tsx` (`const debouncedSearch = useDebouncedValue(filters.search, 300)`) so the input stays controlled and instant; only the query key is debounced. Do not touch `TransactionFilters.tsx`.

Verify: typing "coffee" fires 1 request (was 6); month arrows never blank the list.

### 1.4 — Client: dedupe the double month fetch
- Delete the second `useTransactions(filters)` call. Fetch once with `effectiveFilters` (filters + debounced search, no type).
- Type tabs filter client-side with strict `t.transaction_type === typeFilter` (column is NOT NULL, matches server `.eq` semantics). Tabs become instant, zero network.
- Extract the totals reducer verbatim into `client/src/utils/transactionCalcs.ts` + tests (split-aware: only `is_my_share` amounts). Phase 2 later revises this util.
- Pass `isPlaceholderData` into `TransactionList` for an opacity cue (stale data must be visually distinct in a finance app).

Verify: 1 request on load (was 2); 0 requests on tab clicks; totals unchanged; Dashboard→Transactions can hit shared `['transactions', {month, year}]` cache.

### 1.5 — useBudgetGoals enabled guard
In `client/src/hooks/useBudget.ts`: `enabled: month >= 1 && month <= 12 && year > 0`. Kills the wasted `month=0&year=0` request SpendingPace fires on every Dashboard load (it returns a useless empty 200 after two pointless queries). No caller changes needed.

### 1.6 — Parallelize Dashboard loading
Delete the full-page early-return Spinner in `Dashboard.tsx` (lines ~22-28); every widget already has its own loading state except the Spending by Category pie card body — give it one. All five widget queries then fire in parallel on first paint instead of queuing behind `/stats/monthly`.

### 1.7 — ErrorState component + wiring
- New `client/src/components/ui/ErrorState.tsx` mirroring `EmptyState` (AlertTriangle, rose tint, optional `onRetry` button). First component test (`@testing-library/react`, already a devDependency).
- Transactions: on `isError` render ErrorState instead of the list and suppress header totals (never show `-$0.00` on error). **Check `isError` before rendering placeholder data** (keepPreviousData can hold stale rows during a failed refetch).
- Dashboard: pie card body on `useMonthlyStats` error. Insights: page-level on `useInsights` error. Per-widget error handling deferred deliberately.

Verify: kill the server, reload each page → error cards with working retry; nothing renders $0/empty as if legitimate.

---

# Phase 2 — Spent-math consolidation (9 commits, in a worktree after Phase 1 merges)

**Six copies found** (not four): `stats.ts getExpenseAmount`, `budget-goals.ts` inline, `Transactions.tsx` totals memo, `DailySpending.tsx`, plus two verbatim copies in `transactions.ts` PATCH `is_recurring` handler (lines ~449-461, ~470-482).

**Documented divergences and canonical decisions**:
| Divergence | Canonical behavior | Number shift |
|---|---|---|
| `/monthly` + `/yearly` net FULL return amounts even when split | Returns are split-aware (my share only) | total_spent rises where split returns exist |
| budget-goals excludes null-type rows via `.in(...)` query | Type fallback `amount > 0 ? expense : income`, resolve in code | goals count more txns, now match dashboard |
| budget-goals single-pass netting swallows returns ordered before expenses | Two-pass: gross first, subtract returns, clamp at end | affected goals shift either direction |
| DailySpending falls back to full amount when a split has no my-share rows | Count 0 (per CLAUDE.md: only is_my_share counts) | inflated day bars shrink |
| Header applies my-share to income/investment/transfer types | My-share applies to expense/return only | expected no-op (probe first) |

**Two constraints**:
- `insights.dailySpending` is current-month-only; DailySpending takes month/year props. Fix: add `daily_spending` to `/stats/monthly` (already month-parameterized), consume via `useMonthlyStats`, delete the dead insights field.
- Header totals are filter-sensitive (account/category/tag/search/date). Server totals only apply when filters are month/year-only; otherwise fall back to one tested client util (`client/src/utils/spending-math.ts`), documented as the mirror of the server module.

### Commits
- **2.0** Capture baselines: save `/stats/monthly` (several months), `/stats/yearly`, `/budget-goals`, `/stats/insights` responses + header/DailySpending screenshots. SQL probes: count split returns, null-type categorized rows, splits with zero my-share, split non-expense/return rows (expect 0).
- **2.1** New `server/src/services/spending-math.ts` + full vitest suite (pure addition): `resolveTransactionType`, `getMyShareAmount`, `netSpendByKey` (generic two-pass), `summarizeByType`, `buildDailySpending`. Date bucketing via string split, never `new Date()` (timezone).
- **2.2** Refactor `/monthly` + `/yearly` onto the service; diff against baseline; only expected shift is split-return netting.
- **2.3** Refactor `/insights` onto the service (keep merchant/velocity/MoM structure).
- **2.4** Refactor `budget-goals.ts` (`netSpendByKey` keyed by category); changed goals must now match dashboard `by_category` exactly.
- **2.5** Extend `/stats/monthly` with `gross_expenses`, `total_returns`, `total_transfers`, `daily_spending`; extend `MonthlyStats` type. Additive.
- **2.6** `DailySpending.tsx` consumes `monthly.daily_spending`; delete its raw-transactions recompute.
- **2.7** Transactions header: unfiltered months read `/stats/monthly` (render `gross_expenses - total_returns` to preserve unclamped display) and drop the transactions-derived totals for that case; sub-month filters use the shared client util. Revise the Phase 1 `transactionCalcs.ts` into `spending-math.ts` here.
- **2.8** Refactor the two inline copies in `transactions.ts` recurring handler onto `getMyShareAmount`.
- **2.9** (Optional) Remove dead `insights.dailySpending` from server response + `InsightsData`.

---

# Phase 3 — Cleanup pass (6 commits)

**All dead-code claims re-verified by grep before planning.** Extra finds: the "Auto-sync investment holdings" block in `routes/plaid.ts` (~320-335) calls `getInvestmentHoldings` and discards the result (no-op since 3ffbed8); deleting the 4 dead hooks cascades to 4 more orphaned api.ts functions + `BalanceResponse` + `MerchantMapping` type.

- **3.1 Client dead code**: delete hooks `useTransaction`, `useCreateManualTransaction`, `useRefreshBalance`, `useBulkRemoveTagFromTransactions`; api.ts exports `refreshBalance` (+`BalanceResponse`), `reclassifyTransactions`, `recategorizeAllTransactions`, `getTransaction`, `createManualTransaction`, `bulkRemoveTagFromTransactions`, merchant-mappings client functions; `MerchantMapping` type; **delete `pages/index.ts` barrel** (zero consumers; keeping it invites imports that defeat per-page lazy loading). `noUnusedLocals` in tsconfig is the safety net. Keep the merchant-mappings SERVER route (used by plaid/csv-import/transactions internally).
- **3.2 Server**: delete the no-op holdings-sync block in `routes/plaid.ts`; slim `getInvestmentHoldings` to return only `{ accounts }` (drop `PlaidHolding`/`PlaidSecurity` mapping; `routes/accounts.ts:136` only reads `.accounts`). Smoke: investment account sync still updates balance.
- **3.3 Settings Data Management**: implement `GET /api/export` (all 12 tables, `asyncHandler`, **redact `plaid_access_token`/`plaid_cursor`**, paginate transactions past the 1000-row PostgREST cap with `.range()` loops, shape `{exported_at, version, data}`); wire the Export button (Blob download `budgetflow-export-YYYY-MM-DD.json`); **delete the Clear All Data button**.
- **3.4 Migration 022** resolve 016/020 contradiction: first check `SELECT key FROM app_settings WHERE key IN ('expected_monthly_income','net_worth_monthly_investments')`. If 020 was applied: add `022_restore_app_settings_keys.sql` re-seeding `expected_monthly_income` `'0'` `ON CONFLICT DO NOTHING` (don't seed the net-worth key; the page recreates it on save). If 020 was never applied: delete 020 from the repo instead (its comment is factually wrong for both keys). **User note: if 020 ran, the saved monthly-investments value is unrecoverable and must be re-entered on the Net Worth page.**
- **3.5 Migration 024 (DESTRUCTIVE)**: drop `holdings` then `securities` (FK order), drop `accounts.balance_threshold` + `accounts.last_balance_alert_at`. Pre-flight row counts; do NOT touch `current_balance`/`plaid_account_id`. Run only after 3.2 ships.
- **3.6 Regenerate `supabase-schema.sql`** (repo ROOT, not migrations/) after 022/023/024 are applied: `supabase db dump` or `pg_dump --schema-only` against the live DB; header comment "Baseline as of migration 024; fresh setups run this then migrations 025+"; verify RLS statements present, securities/holdings absent; sanity-diff against the `Database` type; update README line ~47.

### Phase 3b — Savings goals removal (3 commits, pending decision 1)
- **3b.1** Delete `SavingsGoalCard.tsx`, `SavingsGoalModal.tsx`, their exports in `components/plan/index.ts`, `useSavingsGoals.ts` (+ index export), the 4 api.ts functions (lines ~497-513), `SavingsGoal` type.
- **3b.2** Delete `server/src/routes/savings-goals.ts` + its import/mount in `server/src/index.ts` (lines ~36, 62).
- **3b.3** Migration 023 (**DESTRUCTIVE**): `DROP TABLE IF EXISTS public.savings_goals;` — the table may contain real rows from before Feb 2026; `SELECT * FROM savings_goals` first and export anything sentimental. Ship code commits first, run SQL last.
- **Alternative (re-land, if overruled)**: ~40 lines in `NetWorthPage.tsx` wiring the existing card/modal/hooks with `useModalState`; honest follow-up requires an `account_id` link so progress tracks a real balance.

---

# Phase 4 — Insights year picker (2 commits, independent)

- **4.1** Extract shared `client/src/components/ui/YearSelector.tsx` (props: `year`, `onYearChange`, `minYear`/`maxYear`; chevrons disabled+dimmed at bounds; modeled on `MonthSelector`). Replace YearOverview's inline picker (also fixes its unbounded arrows).
- **4.2** Insights: drop `useMonthNavigation` (it's per-component useState, nothing shared), use local `useState(currentYear)`, pass `year` into `useYearlyStats` and as a new required prop to `SpendingTrend` (single call site, verified). Update the three year-dependent strings; switch "YTD" tile labels to "{year} Total" when viewing a past year. Top Merchants stays last-6-months (server hardcodes a rolling window; already labeled). Bound picker 2024..current.

---

## Standing verification per commit
`npm test` from root (both workspaces), `npm run build --prefix client` (tsc catches dangling imports), plus each commit's specific curl/DevTools/SQL check listed above. Destructive SQL always: pre-flight SELECT, code ships first, migration runs last.
