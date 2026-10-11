-- Migration: let the user keep an idle Plaid connection without being asked again for a while
-- Run this in the Supabase SQL editor BEFORE deploying the code that reads and writes it.
-- The accounts list selects every column and the idle check reads this one, and the "Keep" button
-- writes it, so deploying first would make that button fail until the column exists.
--
-- The Accounts page suggests disconnecting a Plaid connection with no transactions in 60 days,
-- since Plaid bills it monthly regardless. "Keep" sets this on every account of the connection to
-- 90 days ahead, and the suggestion stays hidden until then.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS idle_snoozed_until TIMESTAMPTZ;
