-- After 031 (local harness only: it creates a second auth user, which the stand-in allows).
-- A second user can reuse the owner's names, and the new composite upsert keys work.
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000000b', 'second@example.com');
INSERT INTO user_allowlist (email) VALUES ('second@example.com');
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000000c', 'uninvited@example.com');
SELECT set_config('check.owner_dining', (SELECT id::text FROM categories WHERE name = 'Dining'), true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","email":"second@example.com","role":"authenticated"}', true);

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

  -- Rows can't hang off another user's rows (the owner's seeded transaction and category).
  BEGIN
    INSERT INTO transaction_tags (transaction_id, tag_id)
    VALUES ('30000000-0000-0000-0000-000000000001', (SELECT id FROM tags WHERE name = 'Trip'));
    RAISE EXCEPTION 'second user tagged the owner''s transaction';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO transaction_splits (parent_transaction_id, amount)
    VALUES ('30000000-0000-0000-0000-000000000001', 1);
    RAISE EXCEPTION 'second user split the owner''s transaction';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO budget_goals (category_id, month, year, limit_amount)
    VALUES (current_setting('check.owner_dining')::uuid, 10, 2026, 1);
    RAISE EXCEPTION 'second user budgeted against the owner''s category';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE merchant_mappings SET default_category_id = current_setting('check.owner_dining')::uuid;
    RAISE EXCEPTION 'second user pointed a merchant rule at the owner''s category';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- The owner can still write rows that reference their own rows (so the checks above can't pass
-- merely because the reference policies refuse everything).
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","email":"nilaybarde@gmail.com","role":"authenticated"}', true);
INSERT INTO transaction_splits (parent_transaction_id, amount, description)
  VALUES ('30000000-0000-0000-0000-000000000001', 10, 'owner split');
INSERT INTO tags (id, name, color) VALUES ('40000000-0000-0000-0000-000000000002', 'Owner Check', '#00ff00');
INSERT INTO transaction_tags (transaction_id, tag_id)
  VALUES ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002');
INSERT INTO budget_goals (category_id, month, year, limit_amount)
  VALUES (current_setting('check.owner_dining')::uuid, 11, 2026, 250);
INSERT INTO transactions (id, account_id, amount, date, merchant_name, category_id, parent_transaction_id)
  VALUES ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 5, '2026-10-03',
          'Blue Bottle (part)', current_setting('check.owner_dining')::uuid, '30000000-0000-0000-0000-000000000001');
UPDATE transactions SET notes = 'edited' WHERE id = '30000000-0000-0000-0000-000000000003';
INSERT INTO csv_imports (account_id, file_name) VALUES ('10000000-0000-0000-0000-000000000002', 'owner.csv');
UPDATE merchant_mappings SET default_category_id = current_setting('check.owner_dining')::uuid
  WHERE original_name = 'BLUE BOTTLE #12';
DO $$
BEGIN
  IF (SELECT count(*) FROM transaction_splits WHERE description = 'owner split') <> 1
     OR (SELECT notes FROM transactions WHERE id = '30000000-0000-0000-0000-000000000003') IS DISTINCT FROM 'edited'
     OR (SELECT default_category_id FROM merchant_mappings WHERE original_name = 'BLUE BOTTLE #12')
        IS DISTINCT FROM current_setting('check.owner_dining')::uuid THEN
    RAISE EXCEPTION 'the owner could not write rows referencing their own rows';
  END IF;
END $$;

-- A signed-in user whose email isn't invited can't write even their own rows.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","email":"uninvited@example.com","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO categories (name, icon, color) VALUES ('Mine', 'circle', '#000000');
    RAISE EXCEPTION 'an uninvited user wrote a row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

ROLLBACK;
