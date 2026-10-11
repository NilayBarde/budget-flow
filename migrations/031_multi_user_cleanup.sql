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
