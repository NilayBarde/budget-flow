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
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('check.owner'), 'email', 'nilaybarde@gmail.com', 'role', 'authenticated')::text, true);
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
  BEGIN
    UPDATE accounts SET plaid_item_id = plaid_item_id;
    RAISE EXCEPTION 'authenticated can update accounts.plaid_item_id';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO accounts (plaid_item_id, plaid_access_token, institution_name, account_name, account_type)
    VALUES ('manual-check', 'manual', 'Check', 'Check', 'cash');
    RAISE EXCEPTION 'authenticated can insert accounts (must go through the service role)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- 2b. The owner's id with an email that isn't invited sees nothing: invite-only holds in the database.
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('check.owner'), 'email', 'not-invited@example.com', 'role', 'authenticated')::text, true);
DO $$
BEGIN
  IF (SELECT count(*) FROM transactions) <> 0 THEN
    RAISE EXCEPTION 'a session whose email is not on user_allowlist can read data';
  END IF;
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
