# Multi-User PR 3: Per-User Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every service that touches the database works for exactly one user, whichever client it is given, and Plaid webhooks sync each item as its owner.

**Architecture:** Services take a `DbContext { db, userId }`. Every query they make filters `user_id = userId` and every row they write carries `user_id: userId`. Under the per-user client that is redundant with RLS; under the service-role client (webhooks, scripts) it is what keeps users apart, so one rule makes a service safe for both. Routes build the context from the request; the webhook builds it from the item's owner.

**Spec:** `docs/superpowers/specs/2026-10-11-multi-user-google-sign-in-design.md` §3 (Services, Plaid secrets, Plaid link and sync, Scripts). Parent plan roadmap row PR 3.

## Global Constraints

- `DbContext`, `userContext(req)`, `adminContext(userId)` live in `server/src/db/context.ts`. `userContext` throws if `requireAuth` did not run (no `req.userId`/`req.db`).
- Every service `select`/`update`/`delete` has `.eq('user_id', userId)`; every `insert`/`upsert` row has `user_id`.
- `plaid_access_token` / `plaid_cursor` are read and written only through `services/plaid-secrets.ts` (service role, filtered by `user_id`), or by code already on the service role that receives a token (`plaid-items.ts`).
- Routes still query through the deprecated `supabase` alias in this PR (PRs 4–5 move them); they only pass `userContext(req)` into services.
- Scripts take `--user-email <email>` and run as `adminContext` for that user (moved here from PR 5 because scripts call services).

## Review Focus

1. **Webhook for an item whose rows have two different owners** → logged and skipped, nothing synced, still 200 to Plaid.
2. **Webhook for an unknown item** → 200 with `Account not found`, no throw.
3. **Pending reconciliation copying tags** → the copied `transaction_tags` rows carry the user's id (an insert without it fails the RLS check under the per-user client).
4. **Cursor save after a user-triggered sync** → goes through `plaid-secrets.saveCursor` with the user filter, not the per-user client (which can't write `plaid_cursor`).
5. **`--user-email` for an email with no auth user** → script exits with a clear message before touching data.

## Tasks

1. `db/context.ts` + tests (`userContext` throws without auth; returns `{ db, userId }`; `adminContext` uses `supabaseAdmin`).
2. Leaf services to `DbContext`: `category-lookup`, `merchant-mappings` (`loadMerchantMappings`, `loadManuallyTypedIds`), `sync-error`, `yearly-stats`. Update their tests to assert the `user_id` filter.
3. `plaid-secrets.ts` (`getItemAccounts(plaidItemId)`, `saveCursor(userId, plaidItemId, cursor)`) + tests; `plaid-items.ts` on `supabaseAdmin` explicitly; `idle-connections.ts` on `is_manual`.
4. `pending-reconciliation`, `card-payment-reconciliation`, `sync-transactions` to `DbContext`; cursor via `saveCursor`. Update their tests (user filters, `user_id` on inserted transactions/splits/tags).
5. Callers: routes pass `userContext(req)`; webhook resolves the single owner via `getItemAccounts` and passes `adminContext(owner)`; scripts parse `--user-email`. Webhook tests for single owner, mixed owners, unknown item.
6. Full suite, `tsc`, PR stacked on #69, `/code-review`.
