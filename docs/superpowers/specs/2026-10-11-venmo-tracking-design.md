# Venmo Tracking Design

## Problem

The user splits expenses in BudgetFlow (dinners, shared purchases) and gets paid
back — or pays others back — via Venmo. Today there's no link between a split
transaction and the Venmo payment that settles it, and Venmo is also used for
plain purchases unrelated to splits. Tracking this by hand has become
error-prone, especially around double-counting: if a $100 dinner is split
50/50 and the $50 reimbursement later shows up as a Venmo deposit, that
deposit must not also get counted as income/spending on top of the original
transaction.

## Goals

- Link Venmo bank activity to BudgetFlow as a real, synced account.
- Automatically match Venmo payments to the split(s) they settle, without
  double-counting either side.
- Let a Venmo payment that is *not* a settlement (a normal purchase) be
  tracked like any other expense.
- Surface what's still owed/owing so nothing falls through the cracks.
- Never retroactively alter existing `transaction_splits` data, and keep every
  automated match reversible.

## Non-goals

- Splitting a transaction automatically based on Venmo requests (splits are
  still created by hand in `SplitTransactionModal`, as today).
- Multi-user accounts / shared ledgers — this is still a single-user app;
  "counterparty" is a free-text label, not a modeled entity.
- Handling Venmo credit card or Venmo's own debit card as separate products —
  only the core Venmo cash account.

## Data model

### `transactions.is_venmo_settlement` (new column, default `false`)

Set `true` only on a Venmo-account transaction that the matcher has linked to
one or more splits. Distinguishes "transfer because money moved between the
user's own accounts" from "transfer because it settled a split" — both are
`transaction_type = 'transfer'` so both are already excluded from
income/expense stats (see `server/src/services/transaction-type.ts` and every
stats query that special-cases `'transfer'`), but the UI needs to tell them
apart.

### `transaction_split_settlements` (new table)

```sql
CREATE TABLE transaction_split_settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_id UUID NOT NULL REFERENCES transaction_splits(id) ON DELETE CASCADE,
  venmo_transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_split_settlements_split_id ON transaction_split_settlements(split_id);
CREATE INDEX idx_split_settlements_venmo_transaction_id ON transaction_split_settlements(venmo_transaction_id);
```

Many-to-many by design: one Venmo payment can settle several splits (a friend
pays back two dinners at once), and in principle a split could be settled
across more than one payment (partial repayment), though the matcher only
auto-creates whole-amount matches (see below) — partial settlement rows would
only arise from a manual link.

A split's **settled amount** is always derived — `SUM(amount) FROM
transaction_split_settlements WHERE split_id = ?` — never stored on the split
itself. This is the key safety property: nothing is written to
`transaction_splits` or `transactions_splits.*` columns, ever, by this
feature. Existing split rows are read-only inputs to matching.

A split is "fully settled" when its derived settled amount is within $0.01 of
`abs(split.amount)` for a `is_my_share = false` split (money owed to the
user) — or, symmetrically, for a `is_my_share = true` split where the user
fronted less than their share (rare, but the model doesn't assume direction).

### RLS

Enable RLS on `transaction_split_settlements` with no permissive policies,
matching every other table (migration 019's pattern) — the server's
service-role key bypasses it.

## Linking Venmo as an account

Standard Plaid Link flow — Venmo is a supported Plaid institution, so linking
it goes through the existing `/api/plaid/*` routes with zero new API surface.
It becomes a normal row in `accounts`. `account-types.ts` may need a new
mapping if Plaid reports Venmo's `account_type`/`account_subtype` in a way
the existing `isCashAccount`/`isCreditCardAccount` helpers don't already
recognize — confirmed during implementation by inspecting a real Link
response, not assumed here.

## Settlement matching

New pure function module `server/src/services/venmo-settlement-matching.ts`
(mirrors the split between `card-payment-pairing.ts` — pure matching logic,
unit-testable with no DB — and `card-payment-reconciliation.ts` — the DB-aware
service that loads candidates and applies changes).

### Candidates

- **Unsettled splits**: `transaction_splits` rows whose derived remaining
  amount (`abs(amount) - settled_amount`) is > $0.01, joined to their parent
  transaction's date (for the time-window check).
- **Unmatched Venmo transactions**: transactions on accounts flagged as
  Venmo, where `is_venmo_settlement = false` and `type_manually_set` is not
  true (respecting user overrides, same rule `isLockedNonTransfer` already
  applies for card pairing).

### Matching rule

1. **Direction**: a Venmo deposit (money in) can only match splits where the
   user is owed money (`is_my_share = false` splits of an expense the user
   paid); a Venmo send (money out) can only match splits representing money
   the user owes.
2. **Window**: candidate splits within a configurable lookback (default 21
   days after the original transaction's date, wider than card-pairing's 3
   days since Venmo requests linger).
3. **Exact 1:1** match on remaining amount (within $0.01) is tried first.
4. **1:N sum-match**: if no 1:1 match, look for a small combination (capped
   at 5 splits, to bound the search) of unsettled splits in the window whose
   remaining amounts sum to the Venmo transaction's amount within $0.01.
5. Ties/ambiguity (more than one equally-valid combination): skip and leave
   for manual linking rather than guessing.

### Applying a match

- Insert one `transaction_split_settlements` row per split in the match, each
  with the amount applied to that split.
- Set the Venmo transaction's `transaction_type = 'transfer'`,
  `is_venmo_settlement = true`.
- Never touches `transaction_splits` rows.

### Unmatched Venmo transactions

Left exactly as sync/categorization already produces them — categorized and
counted as a normal expense or income, per existing `detectTransactionType`
behavior. No special-casing needed since nothing marks them otherwise.

### Safety / idempotency / rollout

- Re-running the matcher is safe: already-settled splits and already-flagged
  Venmo transactions are excluded from candidates, so it can't double-link or
  reclassify something it already resolved.
- Respects `type_manually_set`, same as `card-payment-pairing.ts`.
- Takes a `dryRun` option (default `true` when invoked ad hoc), following
  `card-payment-reconciliation.ts`'s `apply` flag — returns the proposed
  matches without writing. On first rollout, and whenever it's pointed at
  already-synced historical Venmo transactions, it runs dry-run first so the
  proposed matches can be reviewed before applying.
- Hooked into the post-sync pipeline (alongside `card-payment-reconciliation`)
  for ongoing automatic matching once trusted; the first backfill against
  existing history is run manually via the dry-run/apply flow, not
  auto-applied.

### Unlinking (manual override)

A new endpoint (`DELETE /api/transactions/:id/venmo-settlement` or similar)
deletes the settlement row(s) for a Venmo transaction and reverts its
`transaction_type`/`is_venmo_settlement` back to the originally-detected
type. This never touches `transaction_splits` either — only the settlement
link and the Venmo transaction's own type fields.

## API surface

- `GET /api/transactions/pending-settlements` — unsettled splits (both
  directions: owed to user, owed by user), each with remaining amount, age,
  and the parent transaction's description/date. Powers the dashboard card
  and badges.
- `POST /api/transactions/:venmoTxnId/link-split` — manual link, body
  `{ splitIds: string[] }`; validates the amounts sum correctly (reusing the
  $0.01 tolerance) before inserting settlement rows.
- `DELETE /api/transactions/:venmoTxnId/venmo-settlement` — unlink, as above.
- Settlement matcher is invoked from the existing sync pipeline
  (`sync-transactions.ts`) after a Venmo account syncs, same place
  `card-payment-reconciliation.ts` is invoked today.

## Client

- **`hooks/usePendingSettlements.ts`**: React Query hook over the new
  endpoint, invalidated by the same mutations that invalidate `transactions`
  (split create/delete, settlement link/unlink).
- **Dashboard card** (`components/dashboard/PendingVenmoSettlementsCard.tsx`):
  modeled on the existing "Possible missed splits" card — lists unsettled
  splits with remaining amount and a manual link action.
- **Transaction list badge**: in the transactions list, a split transaction
  with a non-zero unsettled "others" remainder shows a small badge ("Awaiting
  $25.00" / "You owe $25.00", direction from `is_my_share`). Clicking it opens
  a small picker to manually link a Venmo transaction, for cases the
  auto-matcher missed or got wrong.
- Settled splits show a subtle "✓ settled via Venmo" indicator instead of the
  badge.

## Error handling

- Matching ambiguity (multiple equally-valid combinations) → leave unmatched,
  surfaced via the pending-settlements list, resolved manually.
- Manual link endpoint rejects (400) if the chosen splits' amounts don't sum
  to the transaction's amount within tolerance, or if any chosen split is
  already fully settled.
- Venmo account sync failures follow existing `sync-error.ts` /
  `sync-health.ts` handling — no special-casing needed since it's a normal
  Plaid-linked account.

## Testing

- `venmo-settlement-matching.test.ts`: pure function tests for 1:1 matching,
  1:N sum-matching, direction filtering, window boundaries, ambiguous-match
  skipping — same style as `card-payment-pairing`'s existing tests.
- `venmo-settlement-reconciliation.test.ts` (or similar): DB-aware service
  tests with mocked Supabase client, covering dry-run vs apply, idempotent
  re-run, and respecting `type_manually_set`.
- Client: `usePendingSettlements` hook test + a rendering test for the badge
  states (unsettled/settled/owed-by-me/owed-to-me).

## Migration

`migrations/028_add_venmo_settlements.sql`:

```sql
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

Purely additive — no backfill of existing rows, no change to any existing
column's meaning. Safe to run against production data with zero behavior
change until the matcher is run (dry-run first) and the new UI ships.
