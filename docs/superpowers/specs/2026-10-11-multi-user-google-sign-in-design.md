# Multi-User Support with Google Sign-In

**Date:** 2026-10-11
**Status:** Draft, awaiting user approval

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
- On sign-out, `queryClient.clear()` so one user's cached data can never render for the next.
- A user menu in the nav shows the Google avatar and email with a "Sign out" item (lucide-react icons).

### Server

- `server/src/db/supabase.ts` exports:
  - `supabaseAdmin`: the existing service-role client (renamed from `supabase`).
  - `createUserClient(accessToken)`: a client built with `SUPABASE_ANON_KEY` and `global.headers.Authorization = Bearer <token>`, `auth: { persistSession: false }`. Every query through it runs under RLS as that user.
  - `type Db = SupabaseClient`.
- New `server/src/middleware/requireAuth.ts`, mounted in `index.ts` on `/api` after `express.json()` and before all routers, skipping `/api/health` and `/api/webhooks`:
  1. Missing or malformed bearer token → `401 { message: 'Not signed in' }`.
  2. `supabaseAdmin.auth.getUser(token)`; error → 401.
  3. Look up `user.email` (lowercased) in `user_allowlist` via `supabaseAdmin`; not found → `403 { message: "This Google account hasn't been invited." }`.
  4. `await ensureUserSetup(user.id)`.
  5. Set `req.userId = user.id` and `req.db = createUserClient(token)`; `next()`.
  - The allowlist check and `ensureUserSetup` result are cached in an in-memory `Map<userId, expiresAt>` for 5 minutes so they don't run on every request. `getUser` runs every request (it is what proves the token is valid and unrevoked).
  - Express `Request` is augmented in `server/src/types/express.d.ts` with `userId: string` and `db: Db`.
- New `server/src/services/user-setup.ts` → `ensureUserSetup(userId)`: if the user has no categories, insert the default category set (moved out of `supabase-schema.sql` into a `DEFAULT_CATEGORIES` constant) with `user_id = userId`, using `supabaseAdmin` and `ON CONFLICT (user_id, name) DO NOTHING` so concurrent first requests are safe.

### One-time external setup (documented in `server/ENV_SETUP.md`)

1. Google Cloud console: create an OAuth client (Web), authorized redirect URI `https://<project>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: paste client ID and secret, enable.
3. Supabase → Authentication → URL Configuration: add `http://localhost:5173` and the Vercel URL as redirect URLs.
4. Env: server needs both `SUPABASE_SERVICE_ROLE_KEY` **and** `SUPABASE_ANON_KEY` (the anon-key fallback for the admin client is removed; startup fails loudly if either is missing). Client needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## 2. Data model and migration

One file, `migrations/028_multi_user.sql`, wrapped in `BEGIN; … COMMIT;` so it applies fully or not at all.

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

Later statements read the owner with `current_setting('budgetflow.owner_id')::uuid`.

### New table

`user_allowlist (email text PRIMARY KEY, created_at timestamptz DEFAULT now())`, RLS enabled with no policies (server-only), seeded with `nilaybarde@gmail.com`. Emails are stored lowercase (`CHECK (email = lower(email))`).

### `user_id` on every data table

Tables: `accounts`, `categories`, `csv_imports`, `transactions`, `budget_goals`, `transaction_splits`, `merchant_mappings`, `tags`, `transaction_tags`, `recurring_transactions`, `app_settings`.

For each:
1. `ADD COLUMN user_id uuid` (for `accounts`, rename the old text column to `legacy_user_id` first, then drop it after backfill).
2. `UPDATE … SET user_id = owner_id`.
3. `ALTER COLUMN user_id SET NOT NULL, SET DEFAULT auth.uid()`, `ADD FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`.
4. `CREATE INDEX idx_<table>_user_id ON <table>(user_id)`.

Child tables (`transactions`, `transaction_splits`, `transaction_tags`, `csv_imports`) get their own `user_id` rather than relying on a join to `accounts`, so every policy is a plain column check and every index is direct.

### Per-user uniqueness

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
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

`anon` gets no policies, so unauthenticated PostgREST access returns nothing.

### Plaid secrets

Signed-in users must not be able to read Plaid access tokens through PostgREST (the browser now holds a user JWT and the anon key). On `accounts`:

```sql
REVOKE SELECT, UPDATE ON accounts FROM authenticated, anon;
GRANT SELECT (<every column except plaid_access_token, plaid_cursor>) ON accounts TO authenticated;
GRANT UPDATE (<user-editable columns>) ON accounts TO authenticated;
```

Consequences for the server:
- No `select('*')` on `accounts` through `req.db`. A shared `ACCOUNT_COLUMNS` constant in `server/src/db/columns.ts` lists the readable columns.
- Reading or writing `plaid_access_token` / `plaid_cursor` goes through `supabaseAdmin` only, via `services/plaid-secrets.ts` (section 3).
- Future migrations that add a column to `accounts` must also `GRANT SELECT (new_col)`; this is added to CLAUDE.md.

### Baseline and docs

- `supabase-schema.sql` stays the 023 baseline; fresh projects run it then 024–028. Default category inserts in the baseline are removed by 028 (they are now created per user by `ensureUserSetup`); 028 deletes nothing for the owner because the owner's existing categories are backfilled.
- CLAUDE.md "Database" and "RLS" sections are rewritten: routes use `req.db`; RLS enforces ownership; `supabaseAdmin` only for webhooks, scripts and Plaid secrets, always with an explicit `user_id` filter.

## 3. Server refactor

### Routes

Every route handler switches from the imported `supabase` to `req.db`. Inserts rely on the `auth.uid()` default, so route code does not set `user_id`. Fetching another user's row by ID returns no rows under RLS, which already flows into the existing 404 paths.

Files: all 13 routers that query the DB (`accounts`, `app-settings`, `budget-goals`, `categories`, `csv-import`, `export`, `investments`, `merchant-mappings`, `plaid`, `recurring`, `stats`, `tags`, `transactions`). `webhooks.ts` stays on `supabaseAdmin`.

Handlers not wrapped in `asyncHandler` today (in `accounts`, `csv-import`, `export`, `investments`, `plaid`, `stats`, `transactions`) are wrapped while being touched, per CLAUDE.md.

### Services

Services stop importing a global client. Each exported function that touches the DB takes a context:

```typescript
export interface DbContext { db: Db; userId: string }
```

Rule: **every service query filters `.eq('user_id', userId)` and every service insert sets `user_id: userId` explicitly.** Under `req.db` this is redundant with RLS; under `supabaseAdmin` (webhook path) it is what keeps users apart. One rule for both paths, so a service is safe no matter who calls it.

Affected: `sync-transactions.ts` (`applySyncResult`, including the `categories` lookup at line 225 that is currently unscoped), `pending-reconciliation.ts`, `card-payment-reconciliation.ts`, `category-lookup.ts`, `merchant-mappings.ts`, `sync-error.ts`, `yearly-stats.ts`, `plaid.ts`.

### Plaid secrets

New `server/src/services/plaid-secrets.ts`, the only code that reads or writes `plaid_access_token` / `plaid_cursor`:

- `getItemSecrets(userId, accountId)` → `supabaseAdmin` select of token + cursor `WHERE id = accountId AND user_id = userId`; returns `null` if not found (the route then 404s).
- `getItemAccountsByPlaidItem(plaidItemId)` → for webhooks: all account rows for an item including `user_id`.
- `saveCursor(plaidItemId, cursor)`, `saveAccessToken(...)` for link/relink.

`account-redaction.ts` remains as a defense-in-depth strip on responses.

### Plaid link and sync

- `plaid.ts` route: `createLinkToken` passes `client_user_id: req.userId` (replacing `DEFAULT_USER_ID`). Exchange inserts new accounts via `supabaseAdmin` (token column is not writable by `authenticated`) with `user_id: req.userId` set explicitly.
- Duplicate-account detection by `plaid_account_id` (plaid.ts:160) is scoped to `user_id = req.userId`. If the same `plaid_account_id` exists under a different user, the exchange returns `409 { message: 'This bank account is already linked by another user.' }` rather than reassigning it.
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

Order matters: after the migration, the old server code (service role, no `user_id` on inserts) would fail inserts because `auth.uid()` is null for the service role. Migration and deploy go out together.

1. Google OAuth client + Supabase Google provider + redirect URLs (section 1).
2. Supabase → Authentication → Users → **Add user** with `nilaybarde@gmail.com` (auto-confirm). On first Google sign-in Supabase links the Google identity to this existing user because the verified email matches, so the ID the migration assigns is the one you sign in as.
3. Set the new env vars on the server host and Vercel.
4. Run `028_multi_user.sql` in the SQL editor, then run the isolation-check SQL.
5. Deploy server and client immediately after.
6. Sign in with Google and verify your data.

**If the Google sign-in creates a separate user instead of linking** (visible as two `nilaybarde@gmail.com` rows in Auth → Users), reassign with a one-off script included at the bottom of 028 as a commented block: update `user_id` from the placeholder ID to the Google user's ID on every table, then delete the placeholder user.

Plaid webhooks that arrive between steps 4 and 5 fail; the next sync picks the changes up from the stored cursor, so nothing is lost.

## Risks

- **Broad mechanical change** (~170 DB call sites across 22 files). Mitigated by the type change: removing the `supabase` export makes every un-migrated call site a compile error.
- **Column grants on `accounts`** must be maintained when columns are added. Documented in CLAUDE.md; a forgotten grant fails loudly (permission denied), not silently.
- **Service-role paths bypass RLS.** Confined to webhooks, scripts, `plaid-secrets.ts` and `ensureUserSetup`, all of which filter or stamp `user_id` explicitly and have tests asserting it.
