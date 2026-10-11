-- After 031 (local harness only: it creates a second auth user, which the stand-in allows).
-- A second user can reuse the owner's names, and the new composite upsert keys work.
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000000b', 'second@example.com');
INSERT INTO user_allowlist (email) VALUES ('second@example.com');

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
END $$;

ROLLBACK;
