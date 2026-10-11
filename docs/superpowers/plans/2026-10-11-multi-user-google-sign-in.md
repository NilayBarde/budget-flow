# Multi-User Support with Google Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let several invited people sign in with Google and each see only their own BudgetFlow data, enforced by Postgres row-level security.

**Architecture:** Every data table gets a `user_id uuid` owned by a Supabase Auth user and an `owner_all` RLS policy. Routes query through a per-request Supabase client carrying the user's JWT; the service-role client remains only for webhooks, scripts and Plaid secrets. Delivered as 7 PRs into a `feature/multi-user` branch, then one PR into main.

**Tech Stack:** Postgres/Supabase (RLS, column privileges), Express 5 + TypeScript, `@supabase/supabase-js` 2.89, React + React Query, Vitest, local Postgres for migration tests.

**Spec:** `docs/superpowers/specs/2026-10-11-multi-user-google-sign-in-design.md`

**How this plan is organized:** PR 1 (database foundation) is planned in full below. PRs 2–7 are listed as a roadmap with their scope and interfaces; each gets its own detailed plan, written against the code as it is when that PR starts, because `main` keeps changing the files they touch (`accounts.ts`, `plaid.ts`) and exact code written today would be stale.

## Global Constraints

- Owner email: `nilaybarde@gmail.com`.
- Migrations: `030_multi_user.sql` (expand, run before deploy) and `031_multi_user_cleanup.sql` (contract, run after deploy and owner sign-in). Each wrapped in `BEGIN; … COMMIT;`.
- Data tables (exactly these 11): `accounts`, `categories`, `csv_imports`, `transactions`, `budget_goals`, `transaction_splits`, `merchant_mappings`, `tags`, `transaction_tags`, `recurring_transactions`, `app_settings`.
- Policy text: `USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))`, `FOR ALL TO authenticated`, named `owner_all`.
- 030 default: `COALESCE(auth.uid(), '<owner uuid>'::uuid)`; 031 default: `auth.uid()`.
- Signed-in users cannot read `plaid_access_token` / `plaid_cursor`, cannot update `id`, `user_id`, `is_manual`, `plaid_access_token`, `plaid_cursor`.
- PRs 1–6 target `feature/multi-user`, no version bump. PR 7 targets `main` with `npm version minor --no-git-tag-version`.
- Every route handler wrapped in `asyncHandler`; tests in `__tests__/` next to the code; `vi.fn()` mocks.

## Review Focus

1. **Owner not yet created in Supabase Auth when 030 runs** → 030 aborts with "Create the owner user in Supabase Auth before running this migration" and changes nothing (Task 2, no-owner database).
2. **030 run a second time** (easy in a SQL editor) → aborts with "030_multi_user has already been applied" instead of half-applying (Task 3, rerun check).
3. **Code currently on main writing between 030 and 031** (service role, no `user_id`, `ON CONFLICT (key)` / `(original_name)` / `(merchant_display_name)`) → succeeds and rows belong to the owner (Task 2, `legacy-writes-check.sql`).
4. **A signed-in user selecting `plaid_access_token` or changing a row's `user_id`** → permission denied (Task 2, `isolation-check.sql`).
5. **Production constraint names differ from the baseline's defaults** → 031 locates the old unique constraints by their columns, not their names, and aborts loudly if one is missing (Task 3, `drop_unique_on` helper).

---

## File structure (PR 1)

| File | Responsibility |
|---|---|
| `server/scripts/test-migrations.sh` | Spins up a throwaway local Postgres, applies baseline + migrations, runs every SQL check, compares `ACCOUNT_COLUMNS` with the DB grants |
| `server/scripts/sql/supabase-roles.sql` | Cluster-wide Supabase roles (`anon`, `authenticated`, `service_role`) |
| `server/scripts/sql/supabase-stub.sql` | Per-database stand-in for Supabase: `auth.users`, `auth.uid()`, default grants, owner user |
| `server/scripts/sql/legacy-seed.sql` | Rows as the single-user app has them today |
| `server/scripts/sql/legacy-writes-check.sql` | Old-code writes after 030 still work and land on the owner |
| `server/scripts/sql/isolation-check.sql` | Owner sees everything, stranger sees nothing, secrets locked; safe to run in the Supabase SQL editor (rolls back) |
| `server/scripts/sql/post-cleanup-check.sql` | After 031: per-user uniqueness and new upsert keys work (local only) |
| `migrations/030_multi_user.sql` | Expand migration |
| `migrations/031_multi_user_cleanup.sql` | Contract migration |
| `server/src/db/supabase.ts` | `supabaseAdmin`, deprecated `supabase` alias, `createUserClient`, `Db` |
| `server/src/db/columns.ts` | `ACCOUNT_COLUMN_LIST`, `ACCOUNT_COLUMNS` |
| `server/src/types/express.d.ts` | `req.userId`, `req.db` |
| `server/src/db/__tests__/supabase.test.ts` | Client construction tests |

---

### Task 0: Branches

- [ ] **Step 1: Create the feature branch from latest main and push it**

```bash
git fetch origin
git push origin origin/main:refs/heads/feature/multi-user
```

- [ ] **Step 2: Rename the working branch for PR 1 (it already carries the spec and plan commits on top of main)**

```bash
git branch -m multi-user/01-db-foundation
git push -u origin multi-user/01-db-foundation
```

- [ ] **Step 3: Install dependencies in the worktree**

```bash
npm install
```

### Task 1: Local migration harness, green on today's schema

**Files:**
- Create: `server/scripts/sql/supabase-roles.sql`, `server/scripts/sql/supabase-stub.sql`, `server/scripts/test-migrations.sh`
- Modify: `server/package.json` (add `test:migrations` script)

**Interfaces:**
- Produces: `npm run test:migrations --prefix server` — exits 0 when every phase passes, non-zero with the failing SQL error otherwise. Owner test UUID `00000000-0000-0000-0000-00000000000a`.

- [ ] **Step 1: Write the Supabase stand-in**

`server/scripts/sql/supabase-roles.sql`:

```sql
-- Cluster-wide roles Supabase provides. Run once per throwaway cluster.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
```

`server/scripts/sql/supabase-stub.sql`:

```sql
-- Just enough of Supabase for the migrations and checks to run against plain Postgres:
-- the auth schema, auth.uid() reading the JWT claims the way Supabase's does, and the
-- default grants Supabase gives anon/authenticated/service_role on new public tables.
CREATE SCHEMA auth;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000000a', 'nilaybarde@gmail.com');
```

- [ ] **Step 2: Write the harness (phase 1 only: baseline + existing migrations)**

`server/scripts/test-migrations.sh`:

```bash
#!/usr/bin/env bash
# Applies supabase-schema.sql and every migration to a throwaway local Postgres with a
# Supabase stand-in, then runs the SQL checks in scripts/sql. Needs initdb/pg_ctl/psql on PATH.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
sql="$here/sql"
tmp="$(mktemp -d)"
port=54329

cleanup() {
  pg_ctl -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

initdb -D "$tmp/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$tmp/data" -o "-p $port -k $tmp -c listen_addresses=''" -l "$tmp/log" -w start >/dev/null

run() { psql -h "$tmp" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q -X "$@"; }
step() { echo "• $*"; }

# Migration files numbered >= first and < last (numbers compared as integers).
migrations_between() {
  local first=$1 last=$2 f n
  for f in "$root"/migrations/*.sql; do
    n=$((10#$(basename "$f" | cut -c1-3)))
    if [ "$n" -ge "$first" ] && [ "$n" -lt "$last" ]; then echo "$f"; fi
  done | sort
}

new_database() {
  run -d postgres -c "CREATE DATABASE $1"
  run -d "$1" -f "$sql/supabase-stub.sql"
  run -d "$1" -f "$root/supabase-schema.sql"
  local f
  for f in $(migrations_between 24 30); do run -d "$1" -f "$f"; done
}

run -d postgres -f "$sql/supabase-roles.sql"

step "baseline + migrations 024-029"
new_database app

echo "All migration checks passed."
```

Add to `server/package.json` scripts:

```json
"test:migrations": "bash scripts/test-migrations.sh"
```

- [ ] **Step 3: Run it**

Run: `npm run test:migrations --prefix server`
Expected: `• baseline + migrations 024-029` then `All migration checks passed.` (If `uuid-ossp` is missing from the local Postgres install, the baseline fails on `CREATE EXTENSION`; install the contrib package before continuing.)

- [ ] **Step 4: Commit**

```bash
git add server/scripts server/package.json
git commit -m "Add a local Postgres harness for testing migrations"
```

### Task 2: Migration 030 with its checks

**Files:**
- Create: `server/scripts/sql/legacy-seed.sql`, `server/scripts/sql/legacy-writes-check.sql`, `server/scripts/sql/isolation-check.sql`, `migrations/030_multi_user.sql`
- Modify: `server/scripts/test-migrations.sh`

**Interfaces:**
- Consumes: harness from Task 1.
- Produces: tables with `user_id uuid NOT NULL`, `user_allowlist(email, created_at)`, `accounts.is_manual boolean` (generated), composite unique constraints named `<table>_user_id_<cols>_key`.

- [ ] **Step 1: Write the seed and the three checks (they fail until 030 exists)**

`server/scripts/sql/legacy-seed.sql`:

```sql
-- Data shaped like the single-user app's today, written before 030 runs.
INSERT INTO accounts (id, plaid_item_id, plaid_access_token, institution_name, account_name, account_type, plaid_account_id)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'item-1', 'access-sandbox-1', 'Chase', 'Checking', 'checking', 'plaid-acct-1'),
  ('10000000-0000-0000-0000-000000000002', 'manual-2', 'manual', 'Cash', 'Wallet', 'cash', NULL);

INSERT INTO csv_imports (id, account_id, file_name, transaction_count)
VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'wallet.csv', 1);

INSERT INTO transactions (id, account_id, plaid_transaction_id, amount, date, merchant_name, category_id, import_id)
VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'plaid-tx-1', 42.50, '2026-10-01', 'Blue Bottle',
    (SELECT id FROM categories WHERE name = 'Dining'), NULL),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', NULL, 12.00, '2026-10-02', 'Farmers Market',
    (SELECT id FROM categories WHERE name = 'Groceries'), '20000000-0000-0000-0000-000000000001');

INSERT INTO transaction_splits (parent_transaction_id, amount, description, is_my_share)
VALUES ('30000000-0000-0000-0000-000000000001', 21.25, 'my half', TRUE);

INSERT INTO tags (id, name, color) VALUES ('40000000-0000-0000-0000-000000000001', 'Trip', '#ff0000');
INSERT INTO transaction_tags (transaction_id, tag_id)
VALUES ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001');

INSERT INTO merchant_mappings (original_name, display_name) VALUES ('BLUE BOTTLE #12', 'Blue Bottle');
INSERT INTO recurring_transactions (merchant_display_name, average_amount, frequency, last_seen)
VALUES ('Netflix', 15.49, 'monthly', '2026-10-01');
INSERT INTO budget_goals (category_id, month, year, limit_amount)
VALUES ((SELECT id FROM categories WHERE name = 'Dining'), 10, 2026, 300);
INSERT INTO app_settings (key, value) VALUES ('recurring_last_refreshed', '2026-10-01T00:00:00Z');
```

`server/scripts/sql/legacy-writes-check.sql`:

```sql
-- After 030 and before 031: the server code on main (service role, never sets user_id, upserts on
-- the old single-column keys) must keep working, and its rows must belong to the owner.
-- Safe to run in the Supabase SQL editor: everything is rolled back.
BEGIN;
SET LOCAL ROLE service_role;

INSERT INTO categories (name, icon, color) VALUES ('Compat Check', 'circle', '#000000');
INSERT INTO app_settings (key, value) VALUES ('compat_check', 'a')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO app_settings (key, value) VALUES ('compat_check', 'b')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO merchant_mappings (original_name, display_name) VALUES ('COMPAT CHECK', 'Compat')
  ON CONFLICT (original_name) DO UPDATE SET display_name = EXCLUDED.display_name;
INSERT INTO recurring_transactions (merchant_display_name, average_amount, frequency, last_seen)
  VALUES ('Compat Check', 1, 'monthly', '2026-10-01')
  ON CONFLICT (merchant_display_name) DO UPDATE SET average_amount = EXCLUDED.average_amount;

DO $$
DECLARE
  owner_id uuid := (SELECT id FROM auth.users WHERE lower(email) = 'nilaybarde@gmail.com');
BEGIN
  IF (SELECT user_id FROM categories WHERE name = 'Compat Check') IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'legacy insert into categories did not default to the owner';
  END IF;
  IF (SELECT value FROM app_settings WHERE key = 'compat_check') <> 'b' THEN
    RAISE EXCEPTION 'legacy upsert on app_settings(key) did not update';
  END IF;
  IF (SELECT user_id FROM merchant_mappings WHERE original_name = 'COMPAT CHECK') IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'legacy upsert into merchant_mappings did not default to the owner';
  END IF;
END $$;

ROLLBACK;
```

`server/scripts/sql/isolation-check.sql`:

```sql
-- Proves row-level isolation after 030 (and after 031). Run it in the Supabase SQL editor after
-- migrating; it raises an exception on the first failure and rolls back everything it did.
BEGIN;

SELECT set_config('check.owner', (SELECT id::text FROM auth.users WHERE lower(email) = 'nilaybarde@gmail.com'), true);
SELECT set_config('check.stranger', 'ffffffff-ffff-ffff-ffff-ffffffffffff', true);

-- Row counts as the database owner, for comparison.
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','categories','csv_imports','transactions','budget_goals','transaction_splits',
                           'merchant_mappings','tags','transaction_tags','recurring_transactions','app_settings'] LOOP
    EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
    PERFORM set_config('check.total_' || t, n::text, true);
  END LOOP;
END $$;

SET LOCAL ROLE authenticated;

-- 1. The owner sees every row.
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('check.owner'), 'role', 'authenticated')::text, true);
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','categories','csv_imports','transactions','budget_goals','transaction_splits',
                           'merchant_mappings','tags','transaction_tags','recurring_transactions','app_settings'] LOOP
    EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
    IF n::text <> current_setting('check.total_' || t) THEN
      RAISE EXCEPTION 'owner sees % of % rows in %', n, current_setting('check.total_' || t), t;
    END IF;
  END LOOP;
END $$;

-- 2. Plaid secrets are unreadable and ownership is unchangeable, even for the owner.
DO $$
BEGIN
  BEGIN
    PERFORM plaid_access_token FROM accounts;
    RAISE EXCEPTION 'authenticated can read accounts.plaid_access_token';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM plaid_cursor FROM accounts;
    RAISE EXCEPTION 'authenticated can read accounts.plaid_cursor';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE accounts SET user_id = user_id;
    RAISE EXCEPTION 'authenticated can update accounts.user_id';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- 3. Someone else sees nothing and cannot write into the owner's data.
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('check.stranger'), 'role', 'authenticated')::text, true);
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','categories','csv_imports','transactions','budget_goals','transaction_splits',
                           'merchant_mappings','tags','transaction_tags','recurring_transactions','app_settings'] LOOP
    EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
    IF n <> 0 THEN
      RAISE EXCEPTION 'a different user sees % rows in %', n, t;
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO categories (name, icon, color, user_id)
    VALUES ('Intruder', 'circle', '#000000', current_setting('check.owner')::uuid);
    RAISE EXCEPTION 'a different user inserted a row owned by the owner';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- 4. No session at all sees nothing.
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM categories) <> 0 THEN
    RAISE EXCEPTION 'anon can read categories';
  END IF;
END $$;

ROLLBACK;
```

- [ ] **Step 2: Wire the checks into the harness**

In `server/scripts/test-migrations.sh`, replace the block from `step "baseline + migrations 024-029"` to the final `echo` with:

```bash
step "baseline + migrations 024-029, then legacy data"
new_database app
run -d app -f "$sql/legacy-seed.sql"

step "030 aborts when the owner has no Supabase Auth user"
new_database noowner
run -d noowner -c "DELETE FROM auth.users"
if run -d noowner -f "$root/migrations/030_multi_user.sql" 2>"$tmp/err"; then
  echo "030 should have failed without an owner" >&2; exit 1
fi
grep -q "Create the owner user in Supabase Auth" "$tmp/err"
[ "$(run -d noowner -tA -c "SELECT to_regclass('public.user_allowlist') IS NULL")" = "t" ]

step "030 expand migration"
run -d app -f "$root/migrations/030_multi_user.sql"

step "code on main keeps working after 030"
run -d app -f "$sql/legacy-writes-check.sql"

step "isolation after 030"
run -d app -f "$sql/isolation-check.sql"

echo "All migration checks passed."
```

- [ ] **Step 3: Run to see it fail**

Run: `npm run test:migrations --prefix server`
Expected: FAIL at "030 aborts when the owner…" because `migrations/030_multi_user.sql` doesn't exist (`psql: error: … No such file`), then grep fails.

- [ ] **Step 4: Write migration 030**

`migrations/030_multi_user.sql`:

```sql
-- Migration: multiple users, each owning their own data (expand step).
--
-- Run this in the Supabase SQL editor BEFORE deploying the multi-user code, and only after
-- creating the owner in Supabase → Authentication → Users → Add user (nilaybarde@gmail.com,
-- auto-confirm). It aborts without changing anything if that user is missing.
--
-- The code on main keeps working on top of this migration: new user_id columns default to the
-- owner when there is no signed-in user (the service-role key), and the old single-column unique
-- constraints stay until 031. Exception: linking a bank or adding a manual account fails until the
-- new code is deployed, because the old code writes user_id = 'default-user' into what is now a uuid.
--
-- After running it, run server/scripts/sql/isolation-check.sql and legacy-writes-check.sql in the
-- editor; both raise on failure and roll back. Run 031_multi_user_cleanup.sql after the new code is
-- deployed and you have signed in with Google.

BEGIN;

DO $$
DECLARE
  owner_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'user_id'
  ) THEN
    RAISE EXCEPTION '030_multi_user has already been applied';
  END IF;

  SELECT id INTO owner_id FROM auth.users WHERE lower(email) = 'nilaybarde@gmail.com';
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Create the owner user in Supabase Auth before running this migration';
  END IF;

  PERFORM set_config('budgetflow.owner_id', owner_id::text, true);
END $$;

-- Who may sign in. Server-only: RLS on and no policies, so only the service role reads it.
CREATE TABLE user_allowlist (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_allowlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_allowlist FROM anon, authenticated;
INSERT INTO user_allowlist (email) VALUES ('nilaybarde@gmail.com');

-- accounts.user_id was TEXT 'default-user'; it becomes a uuid like every other table's.
ALTER TABLE accounts DROP COLUMN user_id;

DO $$
DECLARE
  owner_id uuid := current_setting('budgetflow.owner_id')::uuid;
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','categories','csv_imports','transactions','budget_goals','transaction_splits',
                           'merchant_mappings','tags','transaction_tags','recurring_transactions','app_settings'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN user_id UUID', t);
    EXECUTE format('UPDATE %I SET user_id = %L', t, owner_id);
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN user_id SET NOT NULL, ALTER COLUMN user_id SET DEFAULT COALESCE(auth.uid(), %L::uuid)',
      t, owner_id);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',
      t, t || '_user_id_fkey');
    EXECUTE format('CREATE INDEX %I ON %I (user_id)', 'idx_' || t || '_user_id', t);
    EXECUTE format(
      'CREATE POLICY owner_all ON %I FOR ALL TO authenticated '
      'USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))',
      t);
  END LOOP;
END $$;

-- Names only need to be unique per user. The old single-column constraints stay until 031 so the
-- code on main, which upserts on them, keeps working.
ALTER TABLE categories ADD CONSTRAINT categories_user_id_name_key UNIQUE (user_id, name);
ALTER TABLE tags ADD CONSTRAINT tags_user_id_name_key UNIQUE (user_id, name);
ALTER TABLE merchant_mappings ADD CONSTRAINT merchant_mappings_user_id_original_name_key UNIQUE (user_id, original_name);
ALTER TABLE recurring_transactions
  ADD CONSTRAINT recurring_transactions_user_id_merchant_display_name_key UNIQUE (user_id, merchant_display_name);
ALTER TABLE budget_goals
  ADD CONSTRAINT budget_goals_user_id_category_id_month_year_key UNIQUE (user_id, category_id, month, year);
ALTER TABLE app_settings ADD CONSTRAINT app_settings_user_id_key_key UNIQUE (user_id, key);

-- Routes decide "manual or disconnected?" from the token. Signed-in users can't read the token,
-- so expose the answer as its own column. Mirrors isManualToken in server/src/services/account-types.ts.
ALTER TABLE accounts ADD COLUMN is_manual BOOLEAN GENERATED ALWAYS AS (
  plaid_access_token IS NULL OR plaid_access_token = '' OR plaid_access_token LIKE 'manual%'
) STORED;

-- Plaid secrets stay server-side: signed-in users get every accounts column except the token and
-- cursor, and can't rewrite identity columns. A migration that adds an accounts column must grant
-- it here too and add it to ACCOUNT_COLUMN_LIST in server/src/db/columns.ts.
REVOKE ALL ON accounts FROM anon;
REVOKE SELECT, UPDATE ON accounts FROM authenticated;

DO $$
DECLARE
  readable text;
  writable text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO readable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'accounts'
    AND column_name NOT IN ('plaid_access_token', 'plaid_cursor');

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO writable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'accounts'
    AND column_name NOT IN ('id', 'user_id', 'is_manual', 'plaid_access_token', 'plaid_cursor');

  EXECUTE format('GRANT SELECT (%s) ON accounts TO authenticated', readable);
  EXECUTE format('GRANT UPDATE (%s) ON accounts TO authenticated', writable);
END $$;

COMMIT;

-- If your first Google sign-in created a second nilaybarde@gmail.com user instead of linking to the
-- one you created by hand (two rows in Authentication → Users), move the data to the Google one
-- BEFORE running 031, then delete the placeholder user in the dashboard:
--
-- BEGIN;
-- DO $$
-- DECLARE
--   placeholder uuid := '<id of the user you created by hand>';
--   google_user uuid := '<id of the user Google sign-in created>';
--   t text;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY['accounts','categories','csv_imports','transactions','budget_goals','transaction_splits',
--                            'merchant_mappings','tags','transaction_tags','recurring_transactions','app_settings'] LOOP
--     EXECUTE format('UPDATE %I SET user_id = %L WHERE user_id = %L', t, google_user, placeholder);
--     EXECUTE format(
--       'ALTER TABLE %I ALTER COLUMN user_id SET DEFAULT COALESCE(auth.uid(), %L::uuid)', t, google_user);
--   END LOOP;
-- END $$;
-- COMMIT;
```

- [ ] **Step 5: Run the harness**

Run: `npm run test:migrations --prefix server`
Expected: all five `•` steps print, then `All migration checks passed.`

- [ ] **Step 6: Commit**

```bash
git add migrations/030_multi_user.sql server/scripts
git commit -m "Give every table an owning user and enforce it with RLS (migration 030)"
```

### Task 3: Migration 031 with its checks

**Files:**
- Create: `migrations/031_multi_user_cleanup.sql`, `server/scripts/sql/post-cleanup-check.sql`
- Modify: `server/scripts/test-migrations.sh`

**Interfaces:**
- Consumes: 030's composite constraints.
- Produces: final schema: only per-user unique constraints, `app_settings` primary key `(user_id, key)`, defaults `auth.uid()`.

- [ ] **Step 1: Write the post-031 check**

`server/scripts/sql/post-cleanup-check.sql`:

```sql
-- After 031 (local harness only: it creates a second auth user, which the stand-in allows).
-- A second user can reuse the owner's names, and the new composite upsert keys work.
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000000b', 'second@example.com');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

INSERT INTO categories (name, icon, color) VALUES ('Dining', 'utensils', '#f97316');
INSERT INTO tags (name, color) VALUES ('Trip', '#ff0000');
INSERT INTO merchant_mappings (user_id, original_name, display_name)
  VALUES ('00000000-0000-0000-0000-00000000000b', 'BLUE BOTTLE #12', 'Coffee')
  ON CONFLICT (user_id, original_name) DO UPDATE SET display_name = EXCLUDED.display_name;
INSERT INTO app_settings (user_id, key, value)
  VALUES ('00000000-0000-0000-0000-00000000000b', 'recurring_last_refreshed', 'x')
  ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO app_settings (user_id, key, value)
  VALUES ('00000000-0000-0000-0000-00000000000b', 'recurring_last_refreshed', 'y')
  ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value;

DO $$
BEGIN
  IF (SELECT user_id FROM categories WHERE name = 'Dining') <> '00000000-0000-0000-0000-00000000000b' THEN
    RAISE EXCEPTION 'insert without user_id did not default to the signed-in user';
  END IF;
  IF (SELECT value FROM app_settings WHERE key = 'recurring_last_refreshed') <> 'y' THEN
    RAISE EXCEPTION 'upsert on app_settings(user_id, key) did not update';
  END IF;
  IF (SELECT count(*) FROM categories) <> 1 THEN
    RAISE EXCEPTION 'second user sees the owner''s categories';
  END IF;
END $$;

ROLLBACK;
```

- [ ] **Step 2: Wire it into the harness**

In `server/scripts/test-migrations.sh`, insert before the final `echo`:

```bash
step "030 refuses to run twice"
if run -d app -f "$root/migrations/030_multi_user.sql" 2>"$tmp/err"; then
  echo "030 should refuse a second run" >&2; exit 1
fi
grep -q "already been applied" "$tmp/err"

step "031 contract migration"
run -d app -f "$root/migrations/031_multi_user_cleanup.sql"

step "isolation and per-user uniqueness after 031"
run -d app -f "$sql/isolation-check.sql"
run -d app -f "$sql/post-cleanup-check.sql"

step "later migrations"
for f in $(migrations_between 32 1000); do run -d app -f "$f"; done
```

- [ ] **Step 3: Run to see it fail**

Run: `npm run test:migrations --prefix server`
Expected: FAIL at "031 contract migration" (file not found).

- [ ] **Step 4: Write migration 031**

`migrations/031_multi_user_cleanup.sql`:

```sql
-- Migration: multiple users (contract step).
--
-- Run this in the Supabase SQL editor AFTER the multi-user code is deployed and you have signed in
-- with Google and seen your data (and after the reassignment block at the bottom of 030, if you
-- needed it). Only invite other people (INSERT INTO user_allowlist) once this has run: until then a
-- second user can't create a category or tag whose name you already use.
--
-- Drops the single-column unique constraints 030 kept for the old code, makes app_settings keyed by
-- (user_id, key), and stops defaulting user_id to the owner. Old constraints are found by their
-- columns rather than their names, so it works even if a name differs from the baseline's default.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.user_allowlist') IS NULL THEN
    RAISE EXCEPTION 'Run 030_multi_user.sql first';
  END IF;
END $$;

CREATE FUNCTION pg_temp.drop_unique_on(tbl regclass, cols text[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  con text;
BEGIN
  SELECT c.conname INTO con
  FROM pg_constraint c
  WHERE c.conrelid = tbl
    AND c.contype IN ('u', 'p')
    AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname::text)
      FROM unnest(c.conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    ) = (SELECT array_agg(x ORDER BY x) FROM unnest(cols) AS x);

  IF con IS NULL THEN
    RAISE EXCEPTION 'No unique constraint on %(%)', tbl, array_to_string(cols, ', ');
  END IF;

  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', tbl, con);
END $$;

SELECT pg_temp.drop_unique_on('categories', ARRAY['name']);
SELECT pg_temp.drop_unique_on('tags', ARRAY['name']);
SELECT pg_temp.drop_unique_on('merchant_mappings', ARRAY['original_name']);
SELECT pg_temp.drop_unique_on('recurring_transactions', ARRAY['merchant_display_name']);
SELECT pg_temp.drop_unique_on('budget_goals', ARRAY['category_id', 'month', 'year']);

-- app_settings: the primary key becomes (user_id, key), replacing 030's interim unique constraint.
SELECT pg_temp.drop_unique_on('app_settings', ARRAY['key']);
SELECT pg_temp.drop_unique_on('app_settings', ARRAY['user_id', 'key']);
ALTER TABLE app_settings ADD PRIMARY KEY (user_id, key);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','categories','csv_imports','transactions','budget_goals','transaction_splits',
                           'merchant_mappings','tags','transaction_tags','recurring_transactions','app_settings'] LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN user_id SET DEFAULT auth.uid()', t);
  END LOOP;
END $$;

COMMIT;
```

- [ ] **Step 5: Run the harness**

Run: `npm run test:migrations --prefix server`
Expected: every `•` step prints, then `All migration checks passed.`

- [ ] **Step 6: Commit**

```bash
git add migrations/031_multi_user_cleanup.sql server/scripts
git commit -m "Make names unique per user and drop the owner default (migration 031)"
```

### Task 4: Server database clients, account columns, request typing

**Files:**
- Modify: `server/src/db/supabase.ts`
- Create: `server/src/db/columns.ts`, `server/src/types/express.d.ts`, `server/src/db/__tests__/supabase.test.ts`
- Modify: `server/scripts/test-migrations.sh` (compare `ACCOUNT_COLUMN_LIST` with the DB grant)

**Interfaces:**
- Produces (used by PRs 2–5):
  - `type Db = SupabaseClient`
  - `supabaseAdmin: Db` — service-role client
  - `supabase: Db` — deprecated alias of `supabaseAdmin`, removed in PR 5
  - `createUserClient(accessToken: string): Db` — anon key + `Authorization: Bearer <token>`; throws if `SUPABASE_URL` or `SUPABASE_ANON_KEY` is unset
  - `ACCOUNT_COLUMN_LIST: readonly string[]`, `ACCOUNT_COLUMNS: string` (comma-joined, for `.select(ACCOUNT_COLUMNS)`)
  - `Express.Request.userId: string`, `Express.Request.db: Db`

- [ ] **Step 1: Write the failing test**

`server/src/db/__tests__/supabase.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn((url: string, key: string) => ({ url, key })),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

const loadModule = () => import('../supabase.js');

beforeEach(() => {
  vi.resetModules();
  createClient.mockClear();
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
});

describe('supabaseAdmin', () => {
  it('uses the service-role key', async () => {
    const { supabaseAdmin } = await loadModule();
    expect(createClient).toHaveBeenCalledWith('https://project.supabase.co', 'service-key');
    expect(supabaseAdmin).toEqual({ url: 'https://project.supabase.co', key: 'service-key' });
  });

  it('is what the deprecated supabase export points at', async () => {
    const { supabase, supabaseAdmin } = await loadModule();
    expect(supabase).toBe(supabaseAdmin);
  });
});

describe('createUserClient', () => {
  it('uses the anon key and forwards the user token so RLS applies', async () => {
    const { createUserClient } = await loadModule();
    createUserClient('user-jwt');
    expect(createClient).toHaveBeenLastCalledWith('https://project.supabase.co', 'anon-key', {
      global: { headers: { Authorization: 'Bearer user-jwt' } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it('returns a new client per call', async () => {
    const { createUserClient } = await loadModule();
    expect(createUserClient('a')).not.toBe(createUserClient('b'));
  });

  it('refuses to build a client without the anon key', async () => {
    delete process.env.SUPABASE_ANON_KEY;
    const { createUserClient } = await loadModule();
    expect(() => createUserClient('user-jwt')).toThrow('SUPABASE_ANON_KEY');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test --prefix server -- src/db/__tests__/supabase.test.ts`
Expected: FAIL — `supabaseAdmin` and `createUserClient` are undefined.

- [ ] **Step 3: Implement**

Replace the top of `server/src/db/supabase.ts` (everything above `export type Database`) with:

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// env is loaded in index.ts

const supabaseUrl = process.env.SUPABASE_URL || '';
// Prefer the service-role key so the server bypasses RLS.
// Fall back to the anon key for backwards compatibility (removed with the auth middleware).
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('Warning: Supabase credentials not configured. Database operations will fail.');
}

export type Db = SupabaseClient;

// Bypasses RLS. Only for work with no signed-in user (Plaid webhooks, scripts) and for Plaid
// secrets; such code must filter and stamp user_id itself.
export const supabaseAdmin: Db = createClient(supabaseUrl, serviceRoleKey);

/** @deprecated Use `req.db` in routes, or `supabaseAdmin` in webhooks and scripts. */
export const supabase = supabaseAdmin;

// A client acting as the signed-in user: every query runs under RLS with their JWT.
export const createUserClient = (accessToken: string): Db => {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for signed-in requests');
  }
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};
```

In the `Database` type's `accounts` entry, add after `idle_snoozed_until`:

```typescript
    /** Derived from the token: manual or disconnected accounts (migration 030) */
    is_manual: boolean;
```

`server/src/db/columns.ts`:

```typescript
// The accounts columns a signed-in user may read: migration 030 grants SELECT on exactly these.
// plaid_access_token and plaid_cursor are deliberately absent; read them with the service-role client.
// A migration that adds an accounts column must grant it and add it here (test:migrations compares).
export const ACCOUNT_COLUMN_LIST = [
  'id',
  'user_id',
  'plaid_item_id',
  'institution_name',
  'account_name',
  'account_type',
  'historical_sync_complete',
  'current_balance',
  'plaid_account_id',
  'exclude_from_investments',
  'investment_exclusion_note',
  'last_csv_import_at',
  'needs_reauth',
  'reauth_detected_at',
  'last_synced_at',
  'created_at',
  'last_sync_error',
  'last_sync_error_at',
  'relinked_at',
  'idle_snoozed_until',
  'is_manual',
] as const;

export const ACCOUNT_COLUMNS = ACCOUNT_COLUMN_LIST.join(', ');
```

`server/src/types/express.d.ts`:

```typescript
import type { Db } from '../db/supabase.js';

declare global {
  namespace Express {
    interface Request {
      /** The signed-in user's id, set by the requireAuth middleware. */
      userId: string;
      /** Supabase client acting as the signed-in user (RLS applies), set by requireAuth. */
      db: Db;
    }
  }
}

export {};
```

- [ ] **Step 4: Run the test and the type check**

Run: `npm run test --prefix server -- src/db/__tests__/supabase.test.ts && (cd server && npx tsc --noEmit)`
Expected: 5 tests pass; tsc prints nothing.

- [ ] **Step 5: Make the harness compare ACCOUNT_COLUMN_LIST with the grant**

In `server/scripts/test-migrations.sh`, insert before the final `echo`:

```bash
step "ACCOUNT_COLUMN_LIST matches what signed-in users may read"
granted="$(run -d app -tA -c "
  SELECT string_agg(column_name, ',' ORDER BY column_name)
  FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND table_name = 'accounts'
    AND grantee = 'authenticated' AND privilege_type = 'SELECT'")"
listed="$(cd "$root/server" && npx tsx -e "
  import('./src/db/columns.ts').then(m => console.log([...m.ACCOUNT_COLUMN_LIST].sort().join(',')))")"
if [ "$granted" != "$listed" ]; then
  echo "accounts grant:      $granted" >&2
  echo "ACCOUNT_COLUMN_LIST: $listed" >&2
  exit 1
fi
```

Run: `npm run test:migrations --prefix server`
Expected: all steps pass. If they differ, fix `ACCOUNT_COLUMN_LIST` to match the grant (the grant is derived from the real table).

- [ ] **Step 6: Run the full server suite and build**

Run: `npm run test --prefix server && npm run build --prefix server`
Expected: all existing tests still pass (the `supabase` export is unchanged for callers); build succeeds.

- [ ] **Step 7: Commit**

```bash
git add server/src/db server/src/types/express.d.ts server/scripts/test-migrations.sh
git commit -m "Add the service-role and per-user Supabase clients and the readable account columns"
```

### Task 5: Open PR 1

- [ ] **Step 1: Push and open the PR into the feature branch**

```bash
git push
gh pr create --base feature/multi-user --head multi-user/01-db-foundation \
  --title "Multi-user 1/7: migrations, local migration tests, DB clients" \
  --body-file <body file>
```

The body lists: what 030/031 do, how to run `npm run test:migrations --prefix server`, that nothing here changes runtime behavior on its own (routes still use the deprecated `supabase` alias), and links the spec and plan.

- [ ] **Step 2: Request a code review** (run `/code-review` on the PR) and address findings before merging into `feature/multi-user`.

---

## Roadmap: PRs 2–7 (each gets its own detailed plan when started)

Before each: `git fetch origin && git merge origin/main` into `feature/multi-user`, re-run `npm test` and `npm run test:migrations --prefix server`.

| PR | Scope (spec section) | Consumes | Produces |
|---|---|---|---|
| 2 | `middleware/requireAuth.ts` (getClaims → allowlist → `ensureUserSetup` → `req.userId`/`req.db`, 5-minute cache), `services/user-setup.ts` + `DEFAULT_CATEGORIES`, mount in `index.ts` skipping `/api/health` and `/api/webhooks`, remove the anon-key fallback and fail startup without both keys (§1) | `supabaseAdmin`, `createUserClient`, `user_allowlist` | `requireAuth`, `ensureUserSetup(userId: string): Promise<void>` |
| 3 | `DbContext { db: Db; userId: string }` through every service; `services/plaid-secrets.ts` (`getItemSecrets`, `getItemAccountsByPlaidItem`, `saveCursor`, `saveAccessToken`); owner-aware webhook sync; `plaid-items.ts` on `supabaseAdmin`; `idle-connections.ts` on `is_manual` (§3) | `Db`, `supabaseAdmin`, `is_manual` | service signatures taking `DbContext` |
| 4 | Routes part 1 — `accounts`, `plaid`, `transactions`, `csv-import` — to `req.db`, `ACCOUNT_COLUMNS` instead of `select('*')`, secrets via `plaid-secrets.ts`, `client_user_id: req.userId`, 409 on another user's account, composite `onConflict`, `asyncHandler` (§2–3) | PR 2, PR 3 | — |
| 5 | Routes part 2 — the other nine — same treatment; delete the deprecated `supabase` export; scripts take `--user-email` (§3) | PR 2, PR 3 | compile-time guarantee no route uses the admin client |
| 6 | Client: `services/supabase.ts`, `AuthProvider`/`AuthContext`, `RequireAuth` (Layout and `/oauth-callback`), `/login`, bearer header + `fetchForm` + 401/403 handling in `api.ts`, user menu, sign-out clears query cache and the Plaid link token (§1, §4). End-to-end checks against the Supabase dev project | PRs 2–5 | — |
| 7 | Into main: `ENV_SETUP.md`, CLAUDE.md (Database/RLS rules, accounts grant rule), minor version bump, end-to-end checklist from spec §5 | all | release |
