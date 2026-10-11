# Multi-User Support with Google Sign-In

**Date:** 2026-10-11
**Status:** Approved 2026-10-11 (third review pass applied)

## Goal

Let more than one person use BudgetFlow, each with their own completely separate data, signing in with Google. Today the app is single-user: `user_id = 'default-user'` is hardcoded, only `accounts` has a `user_id` column, and the API has no authentication at all, so anyone who knows the server URL can read every transaction.

### Decisions made with the user

- **Fully separate users.** Each person sees only their own banks, transactions, categories, budgets, tags, rules, recurring items and settings. Nothing is shared between users.
- **Invite-only, Google sign-in.** No public sign-up. A Google account can use the app only if its email is on an allowlist.
- **Isolation via per-request Supabase client + RLS.** The database enforces ownership with `auth.uid()`; the service-role key is kept only for work that has no signed-in user (Plaid webhooks, CLI scripts) and for reading Plaid secrets.
- **Existing data belongs to the owner.** Everything stored today becomes owned by `nilaybarde@gmail.com`'s Google sign-in.

### Assumptions (correct these if wrong)

- Inviting is done by inserting an email into `user_allowlist` in the Supabase SQL editor. No invite UI.
- New users start with the default categories and nothing else.
- A short downtime during rollout (migration, then deploy) is acceptable.

## Scope

**In scope:** Google sign-in, auth middleware, allowlist, `user_id` on every data table, RLS policies, per-user uniqueness, request-scoped DB client throughout the server, owner-aware Plaid sync and webhooks, client login/logout, backfilling existing data to the owner.

**Out of scope:** invite/admin UI, sharing data between users or a household view, account deletion or data export per user (the existing export route simply becomes per-user), per-user Plaid cost reporting, email/password sign-in.

## 1. Sign-in and access

### Client

- Add `@supabase/supabase-js` to the client. New `client/src/services/supabase.ts` creates the browser client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The anon key is public by design; RLS protects data.
- New `/login` page (`pages/Login.tsx`) with one "Continue with Google" button calling `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`. It shows the server's 403 message ("This Google account hasn't been invited") when the signed-in account is not allowlisted.
- `AuthProvider` + `AuthContext` (`hooks/AuthProvider.tsx`, `hooks/AuthContext.ts`, mirroring `MonthProvider`) hold the session, subscribe to `onAuthStateChange`, and expose `{ session, user, signOut }`.
- `RequireAuth` wraps the `<Layout />` route in `App.tsx`; with no session it redirects to `/login`. `/login` stays outside it. The Plaid `/oauth-callback` route sits outside `Layout` today and gets its own `RequireAuth` wrapper, because finishing a bank link calls the API.
- `services/api.ts`: `fetchApi` reads the current access token (`supabase.auth.getSession()`) and adds `Authorization: Bearer <token>`. The three CSV `FormData` calls, which call `fetch` directly today, move onto a shared `fetchForm<T>()` helper in the same file that adds the same header (without `Content-Type`). Any 401 signs out and sends the user to `/login`; 403 surfaces the server message.
- On sign-out, `queryClient.clear()` and remove the Plaid OAuth link token that `PlaidLinkButton` keeps in `localStorage`, so nothing from one user carries over to the next person on the same browser.
- A user menu in the nav shows the Google avatar and email with a "Sign out" item (lucide-react icons).

### Server

- `server/src/db/supabase.ts` exports:
  - `supabaseAdmin`: the existing service-role client (renamed from `supabase`).
  - `createUserClient(accessToken)`: a client built with `SUPABASE_ANON_KEY` and `global.headers.Authorization = Bearer <token>`, `auth: { persistSession: false }`. Every query through it runs under RLS as that user.
  - `type Db = SupabaseClient`.
- New `server/src/middleware/requireAuth.ts`, mounted in `index.ts` on `/api` after `express.json()` and before all routers, skipping `/api/health` and `/api/webhooks`:
  1. Missing or malformed bearer token → `401 { message: 'Not signed in' }`.
  2. `supabaseAdmin.auth.getClaims(token)` (available in the installed supabase-js 2.89); invalid or expired → 401. With Supabase's asymmetric JWT signing keys enabled this verifies the signature locally against the cached JWKS, so it adds no network call; on a legacy symmetric-key project it falls back to a call to Supabase Auth. Enabling signing keys is part of the one-time setup. PostgREST verifies the same token again on every query, so the database never trusts the middleware alone.
  3. Look up the `email` claim (lowercased) in `user_allowlist` via `supabaseAdmin`; not found → `403 { message: "This Google account hasn't been invited." }`.
  4. `await ensureUserSetup(sub)`.
  5. Set `req.userId = sub` (the claims' user ID) and `req.db = createUserClient(token)`; `next()`.
  - The allowlist check and `ensureUserSetup` result are cached in an in-memory `Map<userId, expiresAt>` for 5 minutes so they don't run on every request. Consequence: removing someone from the allowlist takes effect within 5 minutes, not instantly. Token verification runs on every request.
  - Express `Request` is augmented in `server/src/types/express.d.ts` with `userId: string` and `db: Db`.
- New `server/src/services/user-setup.ts` → `ensureUserSetup(userId)`: if the user has no categories, insert the default category set (moved out of `supabase-schema.sql` into a `DEFAULT_CATEGORIES` constant) with `user_id = userId`, using `supabaseAdmin` and `ON CONFLICT (user_id, name) DO NOTHING` so concurrent first requests are safe.

### One-time external setup (documented in `server/ENV_SETUP.md`)

1. Google Cloud console: create an OAuth client (Web), authorized redirect URI `https://<project>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: paste client ID and secret, enable. Supabase → Settings → JWT Keys: migrate to asymmetric signing keys so `getClaims` verifies locally.
3. Supabase → Authentication → URL Configuration: add `http://localhost:5173` and the Vercel URL as redirect URLs.
4. Env: server needs both `SUPABASE_SERVICE_ROLE_KEY` **and** `SUPABASE_ANON_KEY` (the anon-key fallback for the admin client is removed; startup fails loudly if either is missing). Client needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## 2. Data model and migration

Two files, each wrapped in `BEGIN; … COMMIT;` so it applies fully or not at all (`028` and `029` are taken on main as of 2026-10-11; re-check `ls migrations | tail -1` before creating them):

- **`030_multi_user.sql` (expand):** run **before** deploying, per CLAUDE.md. It is written so the code currently on main keeps working on top of it: it adds columns, policies, grants and the new composite unique constraints, but keeps the old single-column unique constraints and gives `user_id` a default of `COALESCE(auth.uid(), '<owner uuid>')`, so service-role inserts from the old code still get an owner. Everything below describes 030 unless marked otherwise.
- **`031_multi_user_cleanup.sql` (contract):** run **after** the new code is deployed and you've signed in. It drops the old single-column unique constraints and sets each `user_id` default to plain `auth.uid()`. Until 031 runs, a second user can't create a category or tag whose name the owner already uses, so invite people only after it.

### Owner lookup

```sql
DO $$
DECLARE owner_id uuid;
BEGIN
  SELECT id INTO owner_id FROM auth.users WHERE email = 'nilaybarde@gmail.com';
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Create the owner user in Supabase Auth before running this migration';
  END IF;
  PERFORM set_config('budgetflow.owner_id', owner_id::text, true);
END $$;
```

Later statements read the owner with `current_setting('budgetflow.owner_id')::uuid`; the `COALESCE` defaults embed it as a literal through `EXECUTE format(...)`, since a column default can't read a transaction-local setting later.

### New table

`user_allowlist (email text PRIMARY KEY, created_at timestamptz DEFAULT now())`, RLS enabled with no policies (server-only), seeded with `nilaybarde@gmail.com`. Emails are stored lowercase (`CHECK (email = lower(email))`).

### `user_id` on every data table

Tables: `accounts`, `categories`, `csv_imports`, `transactions`, `budget_goals`, `transaction_splits`, `merchant_mappings`, `tags`, `transaction_tags`, `recurring_transactions`, `app_settings`.

For each:
1. `ADD COLUMN user_id uuid` (for `accounts`, rename the old text column to `legacy_user_id` first, then drop it after backfill).
2. `UPDATE … SET user_id = owner_id`.
3. `ALTER COLUMN user_id SET NOT NULL, SET DEFAULT COALESCE(auth.uid(), '<owner uuid>')` (031 changes it to `auth.uid()`), `ADD FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`. Deleting a user in Supabase Auth therefore deletes all of their data; that is the intended way to remove someone.
4. `CREATE INDEX idx_<table>_user_id ON <table>(user_id)`.

Child tables (`transactions`, `transaction_splits`, `transaction_tags`, `csv_imports`) get their own `user_id` rather than relying on a join to `accounts`, so every policy is a plain column check and every index is direct.

### Per-user uniqueness

030 adds the composite constraints alongside the old ones; 031 drops the old ones. `app_settings` can't hold two primary keys, so 030 adds `UNIQUE (user_id, key)` and 031 replaces the primary key with `(user_id, key)`. `ensureUserSetup` would hit the old `UNIQUE (name)` for a second user's default categories, which is one more reason others are invited only after 031.

| Table | Before | After |
|---|---|---|
| `categories` | `UNIQUE (name)` | `UNIQUE (user_id, name)` |
| `tags` | `UNIQUE (name)` | `UNIQUE (user_id, name)` |
| `merchant_mappings` | `UNIQUE (original_name)` | `UNIQUE (user_id, original_name)` |
| `recurring_transactions` | `UNIQUE (merchant_display_name)` | `UNIQUE (user_id, merchant_display_name)` |
| `budget_goals` | `UNIQUE (category_id, month, year)` | `UNIQUE (user_id, category_id, month, year)` |
| `app_settings` | `PRIMARY KEY (key)` | `PRIMARY KEY (user_id, key)` |

`transactions.plaid_transaction_id` and `accounts.plaid_account_id` stay globally unique; Plaid IDs are global. The five existing upserts change their `onConflict` to the composite keys and include `user_id` in the row (the column default does not apply to conflict matching): `app-settings.ts:52` and `recurring.ts:140` → `'user_id,key'`; `recurring.ts:121` and `transactions.ts:496` → `'user_id,merchant_display_name'`; `transactions.ts:402` → `'user_id,original_name'`.

### Policies

RLS is already enabled on all tables (migration 019). Each data table gets:

```sql
CREATE POLICY owner_all ON <table> FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
```

`(SELECT auth.uid())` rather than bare `auth.uid()` is Supabase's documented pattern: Postgres evaluates it once per query instead of once per row, which matters for the stats routes that scan a year of transactions.

`anon` gets no policies, so unauthenticated PostgREST access returns nothing.

### Plaid secrets

Signed-in users must not be able to read Plaid access tokens through PostgREST (the browser now holds a user JWT and the anon key). On `accounts`:

```sql
REVOKE SELECT, UPDATE ON accounts FROM authenticated, anon;
GRANT SELECT (<every column except plaid_access_token, plaid_cursor>) ON accounts TO authenticated;
GRANT UPDATE (<every column except id, user_id, plaid_access_token, plaid_cursor>) ON accounts TO authenticated;
```

`accounts` also gets a readable generated column, because routes decide "is this a manual or disconnected account?" by reading the token today (`isManualToken(...)`, `.neq('plaid_access_token', 'manual')` at `accounts.ts:92`; Disconnect sets the token to `'manual'` at `accounts.ts:365`). Filtering on or selecting a column needs `SELECT` on it, so those would fail with permission denied:

```sql
ALTER TABLE accounts ADD COLUMN is_manual boolean GENERATED ALWAYS AS
  (plaid_access_token IS NULL OR plaid_access_token = '' OR plaid_access_token LIKE 'manual%') STORED;
```

It mirrors `isManualToken` in `services/account-types.ts`. Routes and `idle-connections.ts` switch to `is_manual`; `isManualToken` stays only for code running under `supabaseAdmin` (relink, `plaid-items.ts`). `is_manual` is excluded from the `UPDATE` grant (Postgres rejects updates to generated columns anyway).

`INSERT` and `DELETE` stay table-level. The `UPDATE` grant deliberately covers sync bookkeeping (`current_balance`, `last_synced_at`, `needs_reauth`, `last_sync_error*`) as well as user-editable fields, so routes keep updating those through `req.db`. `user_id` is not updatable, so a row can never change owner.

Consequences for the server:
- No `select('*')` on `accounts` through `req.db`. A shared `ACCOUNT_COLUMNS` constant in `server/src/db/columns.ts` lists the readable columns.
- Reading or writing `plaid_access_token` / `plaid_cursor` goes through `supabaseAdmin` only, via `services/plaid-secrets.ts` (section 3). This includes the cursor reset at `accounts.ts:628`, Disconnect's token write at `accounts.ts:365`, the relink path that reads old tokens to retire the previous Item (`plaid.ts:166-182`), and `plaid-items.ts` `removeItemIfUnused`, which counts accounts by token.
- Manual account creation (`accounts.ts:130`) drops its `user_id: 'default-user'` (the column is now a uuid filled by the default) and keeps writing the `'manual'` token sentinel, which the table-level `INSERT` grant allows.
- Future migrations that add a column to `accounts` must also `GRANT SELECT (new_col)` (and `UPDATE` if routes write it); this is added to CLAUDE.md. `relinked_at` (028) and `idle_snoozed_until` (029) are included in 030's grants.
- Between running 030 and deploying, the old code's two account inserts (linking a bank, adding a manual account) fail because they write `user_id: 'default-user'` into the now-uuid column. Everything else keeps working. Run 030 shortly before deploying to keep that window small.

### Baseline and docs

- `supabase-schema.sql` stays the 023 baseline; fresh projects run it then 024–031. On a fresh project the baseline's default categories have no owner until 030 assigns them to the owner like every other row, so 030 works the same on an existing or fresh database (either way the owner must exist in Auth first). Defaults for later users come from the `DEFAULT_CATEGORIES` constant via `ensureUserSetup`.
- CLAUDE.md "Database" and "RLS" sections are rewritten: routes use `req.db`; RLS enforces ownership; `supabaseAdmin` only for webhooks, scripts and Plaid secrets, always with an explicit `user_id` filter.

## 3. Server refactor

### Routes

Every route handler switches from the imported `supabase` to `req.db`. Plain inserts rely on the `user_id` default, so route code does not set it. The exception is the five upserts listed in section 2, which set `user_id: req.userId` because conflict matching needs the value in the row. Fetching another user's row by ID returns no rows under RLS, which already flows into the existing 404 paths.

Files: all 13 routers that query the DB (`accounts`, `app-settings`, `budget-goals`, `categories`, `csv-import`, `export`, `investments`, `merchant-mappings`, `plaid`, `recurring`, `stats`, `tags`, `transactions`). `webhooks.ts` stays on `supabaseAdmin`.

Handlers not wrapped in `asyncHandler` today (in `accounts`, `csv-import`, `export`, `investments`, `plaid`, `stats`, `transactions`) are wrapped while being touched, per CLAUDE.md.

### Services

Services stop importing a global client. Each exported function that touches the DB takes a context:

```typescript
export interface DbContext { db: Db; userId: string }
```

Rule: **every service query filters `.eq('user_id', userId)` and every service insert sets `user_id: userId` explicitly.** Under `req.db` this is redundant with RLS; under `supabaseAdmin` (webhook path) it is what keeps users apart. One rule for both paths, so a service is safe no matter who calls it.

Affected: `sync-transactions.ts` (`applySyncResult`, including the `categories` lookup at line 271 that is currently unscoped, and the relink adoption added in PR #65), `pending-reconciliation.ts`, `card-payment-reconciliation.ts`, `category-lookup.ts`, `merchant-mappings.ts`, `sync-error.ts`, `yearly-stats.ts`, `plaid.ts`, `plaid-items.ts` (moves to `supabaseAdmin`, since it reads tokens). `relink.ts` and `idle-connections.ts` are pure functions over rows passed in; `idle-connections.ts` takes `is_manual` instead of the token.

### Plaid secrets

New `server/src/services/plaid-secrets.ts`, the only code that reads or writes `plaid_access_token` / `plaid_cursor`:

- `getItemSecrets(userId, accountId)` → `supabaseAdmin` select of token + cursor `WHERE id = accountId AND user_id = userId`; returns `null` if not found (the route then 404s).
- `getItemAccountsByPlaidItem(plaidItemId)` → for webhooks: all account rows for an item including `user_id`.
- `saveCursor(plaidItemId, cursor)`, `saveAccessToken(...)` for link/relink.

`account-redaction.ts` remains as a defense-in-depth strip on responses.

### Plaid link and sync

- `plaid.ts` route: `createLinkToken` passes `client_user_id: req.userId` (replacing `DEFAULT_USER_ID` at `plaid.ts:16`, used at `plaid.ts:235`). Exchange inserts new accounts via `supabaseAdmin` (token column is not writable by `authenticated`) with `user_id: req.userId` set explicitly.
- Duplicate-account detection by `plaid_account_id` (`plaid.ts:166`) is scoped to `user_id = req.userId`. Plaid account IDs are per Item, so two people linking the same joint account get different IDs and this rarely matters; if the same `plaid_account_id` does exist under a different user, the exchange returns `409 { message: 'This bank account is already linked by another user.' }` rather than reassigning it.
- User-triggered sync (accounts/transactions routes) reads secrets with `getItemSecrets(req.userId, id)` and calls `applySyncResult({ db: req.db, userId: req.userId, … })`.
- Webhook sync: `getItemAccountsByPlaidItem(item_id)` → owner `userId` from the rows → `applySyncResult({ db: supabaseAdmin, userId, … })`. If the rows for one item somehow have different owners, log and skip (never mix).

### Scripts

`server/src/scripts/*` keep `supabaseAdmin` and require a `--user-email` argument, resolved to a user ID, which they pass as `userId` into services.

### Errors

- 401 `Not signed in` / 403 `This Google account hasn't been invited.` from middleware.
- 409 for a bank account linked by another user.
- Everything else unchanged: global handler returns 500 `Internal server error`.

## 4. Client changes summary

| File | Change |
|---|---|
| `services/supabase.ts` | new browser client |
| `hooks/AuthContext.ts`, `hooks/AuthProvider.tsx` | session state, `signOut` (clears query cache) |
| `components/auth/RequireAuth.tsx` | redirect to `/login` when signed out |
| `pages/Login.tsx` | Google button, not-invited message |
| `services/api.ts` | bearer header in `fetchApi`; new `fetchForm` for the 3 CSV uploads; 401 handling |
| `App.tsx` | wrap in `AuthProvider`; `/login` route; `RequireAuth` around `Layout` |
| `components/layout/*` nav | user menu with avatar, email, sign out |
| `types/index.ts` | `Account.user_id` stays `string` (now a uuid) |

## 5. Testing

### Development environment

`server/.env` points at the one production Supabase project, so the feature branch can't be exercised end-to-end there without running 030 on real data early. Two layers instead:

- **Local migration test (PR 1).** `server/scripts/test-migrations.sh` creates a throwaway local Postgres cluster (`initdb` in a temp dir; Postgres is installed locally), loads a small stand-in for Supabase (`auth` schema with `auth.users`, an `auth.uid()` that reads `request.jwt.claims` like the real one, `anon`/`authenticated` roles with Supabase's default table grants), runs `supabase-schema.sql` then every migration from 024 up, then runs the isolation-check SQL below and fails on any unexpected result. It also runs a few inserts as the service role between 030 and 031 to prove the old code keeps working.
- **Supabase dev project (before PR 6's end-to-end checks).** A free second Supabase project with the Google provider, the baseline plus migrations, and Plaid sandbox. The local client and server point at it through `server/.env` / `client/.env` while developing. The user creates this project; nothing before PR 6 needs it.

### Server (Vitest, mocks with `vi.fn()`)

- `middleware/__tests__/requireAuth.test.ts`: no header → 401; bad token → 401; valid token, email not allowlisted → 403; allowlisted → sets `req.userId`/`req.db` and calls `next`; allowlist cache hit skips the lookup; `/api/health` and `/api/webhooks` bypass.
- `services/__tests__/user-setup.test.ts`: seeds defaults once; second call is a no-op.
- `services/__tests__/sync-transactions.test.ts` (extend): inserted rows carry `user_id`; category lookup filters by `user_id`.
- `services/__tests__/plaid-secrets.test.ts`: `getItemSecrets` filters by both `id` and `user_id`; returns null for another user's account.
- Webhook test: owner resolved from the item's accounts and passed to `applySyncResult`; mixed-owner item is skipped.
- Existing route/service tests updated for the `DbContext` signature and `req.db`.

### Database isolation check (manual, documented in the migration header)

SQL to run in the editor after migrating, impersonating two users via `set_config('request.jwt.claims', …)` + `SET ROLE authenticated`:
- owner sees their row counts; a second test user sees zero rows in every table;
- second user cannot insert a row with the owner's `user_id` (WITH CHECK fails);
- `SELECT plaid_access_token FROM accounts` as `authenticated` → permission denied.

### End-to-end (manual)

1. Sign in with the owner's Google account → all existing data present.
2. Sign in with a second allowlisted Google account → empty app with default categories; link a sandbox bank; owner doesn't see it.
3. Sign in with a non-allowlisted account → "hasn't been invited" on the login page.
4. Call any `/api` route with no token → 401.
5. Trigger a Plaid sandbox webhook for the second user's item → transactions land under that user only.

`npm test` and `npm run build` pass.

## 6. Rollout

1. Google OAuth client, Supabase Google provider, JWT signing keys, redirect URLs (section 1).
2. Supabase → Authentication → Users → **Add user** with `nilaybarde@gmail.com` (auto-confirm). On first Google sign-in Supabase links the Google identity to this existing user because the verified email matches, so the ID the migration assigns is the one you sign in as.
3. Set the new env vars on the server host and Vercel.
4. Run `030_multi_user.sql`, then the isolation-check SQL. The app on main keeps working (except the two account inserts noted in section 2).
5. Merge the feature branch into main and deploy server and client.
6. Sign in with Google and verify your data.
7. Run `031_multi_user_cleanup.sql`. Only then add other people to `user_allowlist`.

**If the Google sign-in creates a separate user instead of linking** (visible as two `nilaybarde@gmail.com` rows in Auth → Users), run the reassignment block kept commented at the bottom of 030 before step 7: update `user_id` from the placeholder ID to the Google user's ID on every table, then delete the placeholder user.

## 7. Delivery

Work happens on a long-lived `feature/multi-user` branch cut from main. Each step below is its own PR into that branch with a code review before merge; the final PR merges the branch into main. Nothing deploys until that last merge, so the half-built states in between never reach production.

| PR | Into | Contents |
|---|---|---|
| 1 | feature | Migrations 030 and 031 with the isolation-check SQL and `test-migrations.sh`; `supabaseAdmin` / `createUserClient` / `Db` in `db/supabase.ts`; `ACCOUNT_COLUMNS`; Express `Request` typing |
| 2 | feature | `requireAuth` middleware, `user_allowlist` lookup, `ensureUserSetup` + `DEFAULT_CATEGORIES`, mounted in `index.ts`; tests |
| 3 | feature | Services to `DbContext`; `plaid-secrets.ts`; owner-aware webhook sync; `plaid-items.ts` on `supabaseAdmin`; `is_manual` in `idle-connections.ts`; tests |
| 4 | feature | Routes, part 1: `accounts`, `plaid`, `transactions`, `csv-import` (the token- and sync-heavy ones) to `req.db`, composite `onConflict` keys, `asyncHandler` wrapping |
| 5 | feature | Routes, part 2: the remaining nine routers; remove the old `supabase` export so any missed call site fails to compile; scripts take `--user-email` |
| 6 | feature | Client: Supabase browser client, `AuthProvider`, `RequireAuth`, `/login`, bearer header and `fetchForm` in `api.ts`, user menu, sign-out cleanup |
| 7 | main | Docs (`ENV_SETUP.md`, CLAUDE.md), one minor version bump (`npm version minor --no-git-tag-version`), end-to-end checks from section 5 |

- The `Version bump` check only runs on PRs into main, so PRs 1–6 don't bump; PR 7 bumps once.
- Merge main into `feature/multi-user` before opening each PR, and resolve conflicts there, so the final PR has no surprises. `accounts.ts` and `plaid.ts` change often on main.
- PRs 1–5 leave the server running with the auth middleware live but no client sending tokens, so the app on the feature branch is unusable end-to-end until PR 6. That's expected; it never deploys in that state.

## Risks

- **Broad mechanical change** (~170 DB call sites across 22 files). Mitigated by the type change: removing the `supabase` export makes every un-migrated call site a compile error.
- **Column grants on `accounts`** must be maintained when columns are added. Documented in CLAUDE.md; a forgotten grant fails loudly (permission denied), not silently.
- **Rows that point at another user's row.** Foreign keys don't check RLS, so a user who somehow knew another user's transaction UUID could attach their own split or tag to it. The row is owned by them and invisible to the other user, so it changes nothing the other user sees. Accepted; UUIDs are not guessable and are never exposed across users.
- **Plaid webhook is unauthenticated (existing gap).** `/api/webhooks/plaid` doesn't verify Plaid's `Plaid-Verification` JWT today. With several users, a forged webhook could trigger paid syncs for anyone's item (no data exposure, since sync writes only to the item's owner). Follow-up: verify webhook signatures. Not part of this change.
- **Service-role paths bypass RLS.** Confined to webhooks, scripts, `plaid-secrets.ts` and `ensureUserSetup`, all of which filter or stamp `user_id` explicitly and have tests asserting it.
