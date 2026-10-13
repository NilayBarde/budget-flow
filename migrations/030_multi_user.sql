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

  IF (SELECT count(*) FROM auth.users WHERE lower(email) = 'nilaybarde@gmail.com') > 1 THEN
    RAISE EXCEPTION 'More than one Supabase Auth user has the owner''s email; delete the extra one first';
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

-- Supabase Auth hands a session to any Google account, and the anon key is public, so invite-only
-- is enforced here as well as in the server: the policies below admit only allowlisted emails, and
-- removing someone from the allowlist cuts off their database access immediately.
-- Policy helpers live in a schema PostgREST doesn't expose, so they can't be called over the API.
CREATE SCHEMA private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE FUNCTION private.is_allowlisted() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_allowlist WHERE email = lower((SELECT auth.jwt()) ->> 'email')
  )
$$;

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
      'USING (user_id = (SELECT auth.uid()) AND (SELECT private.is_allowlisted())) '
      'WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_allowlisted()))',
      t);
  END LOOP;
END $$;

-- Foreign keys don't check RLS, so without these a user who knew another user's row id could hang
-- their own rows off it (a split on someone else's transaction, a budget on their category). Every
-- referenced row must belong to the writer. The ownership checks are SECURITY DEFINER functions
-- rather than subqueries: a policy on transactions can't query transactions (Postgres reports
-- infinite recursion), and a function argument can't be captured by a subquery's same-named column.
CREATE FUNCTION private.owns_account(row_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.accounts WHERE id = row_id AND user_id = (SELECT auth.uid()))
$$;
CREATE FUNCTION private.owns_category(row_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.categories WHERE id = row_id AND user_id = (SELECT auth.uid()))
$$;
CREATE FUNCTION private.owns_csv_import(row_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.csv_imports WHERE id = row_id AND user_id = (SELECT auth.uid()))
$$;
CREATE FUNCTION private.owns_transaction(row_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.transactions WHERE id = row_id AND user_id = (SELECT auth.uid()))
$$;
CREATE FUNCTION private.owns_tag(row_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.tags WHERE id = row_id AND user_id = (SELECT auth.uid()))
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated;

DO $$
DECLARE
  refs CONSTANT text[][] := ARRAY[
    ['transactions',       '(account_id IS NULL OR private.owns_account(account_id))
                            AND (category_id IS NULL OR private.owns_category(category_id))
                            AND (import_id IS NULL OR private.owns_csv_import(import_id))
                            AND (parent_transaction_id IS NULL OR private.owns_transaction(parent_transaction_id))'],
    ['csv_imports',        'private.owns_account(account_id)'],
    ['budget_goals',       'private.owns_category(category_id)'],
    ['transaction_splits', 'private.owns_transaction(parent_transaction_id)'],
    ['transaction_tags',   'private.owns_transaction(transaction_id) AND private.owns_tag(tag_id)'],
    ['merchant_mappings',  'default_category_id IS NULL OR private.owns_category(default_category_id)']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(refs, 1) LOOP
    EXECUTE format('CREATE POLICY owned_refs_insert ON %I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)',
                   refs[i][1], refs[i][2]);
    EXECUTE format('CREATE POLICY owned_refs_update ON %I AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (%s)',
                   refs[i][1], refs[i][2]);
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

-- The server gives each user the default categories once, recorded by this marker (see
-- server/src/services/user-setup.ts). The owner already has their categories, so they're marked
-- set up and never re-seeded, even if they've renamed or deleted defaults.
INSERT INTO app_settings (user_id, key, value)
VALUES (current_setting('budgetflow.owner_id')::uuid, 'user_defaults_seeded', 'true');

-- Routes decide "manual or disconnected?" from the token. Signed-in users can't read the token,
-- so expose the answer as its own column. Mirrors isManualToken in server/src/services/account-types.ts.
ALTER TABLE accounts ADD COLUMN is_manual BOOLEAN GENERATED ALWAYS AS (
  plaid_access_token IS NULL OR plaid_access_token = '' OR plaid_access_token LIKE 'manual%'
) STORED;

-- Plaid credentials and identifiers stay server-side. Signed-in users can read every accounts
-- column except the token and cursor, and can never write the token, cursor, Plaid item or account
-- ids (writing someone else's item id would hijack how webhooks find an item's owner). Creating an
-- account therefore goes through the service-role client. A migration that adds an accounts column
-- must grant it here too and add it to ACCOUNT_COLUMN_LIST in server/src/db/columns.ts.
REVOKE ALL ON accounts FROM anon;
REVOKE SELECT, INSERT, UPDATE ON accounts FROM authenticated;

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
    AND column_name NOT IN ('id', 'user_id', 'is_manual',
                            'plaid_access_token', 'plaid_cursor', 'plaid_item_id', 'plaid_account_id');

  EXECUTE format('GRANT SELECT (%s) ON accounts TO authenticated', readable);
  EXECUTE format('GRANT UPDATE (%s) ON accounts TO authenticated', writable);
END $$;

COMMIT;

-- If your first Google sign-in created a second nilaybarde@gmail.com user instead of linking to the
-- one you created by hand (two rows in Authentication → Users), run
-- server/scripts/sql/reassign-owner.sql BEFORE 031, then delete the placeholder user in the dashboard.
