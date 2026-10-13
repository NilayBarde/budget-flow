-- Recovery for one rollout mishap: your first Google sign-in created a SECOND nilaybarde@gmail.com
-- user (two rows in Authentication → Users) instead of linking to the one you created by hand, so
-- your data is on the hand-made user and the Google one is empty.
--
-- Replace the two ids below with the ids from Authentication → Users, run this in the Supabase SQL
-- editor BEFORE 031, then delete the hand-made placeholder user in the dashboard.
--
-- The Google user should own nothing yet except what the server seeds on first sign-in (default
-- categories and the setup marker). Those are removed so your own categories can move over without
-- clashing on (user_id, name). If the Google user owns anything else, this stops without changing
-- anything, because merging two sets of real data needs a person to decide.
BEGIN;

DO $$
DECLARE
  placeholder uuid := 'PLACEHOLDER_USER_ID';
  google_user uuid := 'GOOGLE_USER_ID';
  t text;
  has_rows boolean;
  user_id_default text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = placeholder)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = google_user) THEN
    RAISE EXCEPTION 'Both ids must be existing Supabase Auth users';
  END IF;

  IF EXISTS (SELECT 1 FROM public.categories WHERE user_id = google_user AND is_default IS NOT TRUE)
     OR EXISTS (SELECT 1 FROM public.app_settings WHERE user_id = google_user AND key <> 'user_defaults_seeded') THEN
    RAISE EXCEPTION 'The Google user has already created categories or settings; merge by hand';
  END IF;

  FOREACH t IN ARRAY ARRAY['accounts','csv_imports','transactions','budget_goals','transaction_splits',
                           'merchant_mappings','tags','transaction_tags','recurring_transactions'] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE user_id = %L)', t, google_user) INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'The Google user already owns rows in %; merge by hand', t;
    END IF;
  END LOOP;

  DELETE FROM public.categories WHERE user_id = google_user;
  DELETE FROM public.app_settings WHERE user_id = google_user;

  FOREACH t IN ARRAY ARRAY['accounts','categories','csv_imports','transactions','budget_goals','transaction_splits',
                           'merchant_mappings','tags','transaction_tags','recurring_transactions','app_settings'] LOOP
    EXECUTE format('UPDATE public.%I SET user_id = %L WHERE user_id = %L', t, google_user, placeholder);

    -- Before 031 the default still names the owner; point it at the Google user.
    SELECT column_default INTO user_id_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id';
    IF upper(coalesce(user_id_default, '')) LIKE '%COALESCE%' THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET DEFAULT COALESCE(auth.uid(), %L::uuid)',
                     t, google_user);
    END IF;
  END LOOP;
END $$;

COMMIT;
