-- After 030 and before 031: the server code on main (service role, never sets user_id, upserts on
-- the old single-column keys) must keep working, and its rows must belong to the owner.
-- Safe to run in the Supabase SQL editor: everything is rolled back.
BEGIN;
SELECT set_config('check.owner', (SELECT id::text FROM auth.users WHERE lower(email) = 'nilaybarde@gmail.com'), true);
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
  owner_id uuid := current_setting('check.owner')::uuid;
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
