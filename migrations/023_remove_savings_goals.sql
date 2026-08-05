-- !! DESTRUCTIVE: drops the savings_goals table and all rows in it. !!
-- Pre-flight (run first and review):
--   SELECT * FROM savings_goals;
-- Verified 2026-08-04: the table held 0 rows.
-- Run only AFTER the code removal commits are deployed; the feature was
-- fully built (migration 015) but never rendered by any page since the
-- Financial Plan refactor, and the Net Worth goal card supersedes it.
DROP TABLE IF EXISTS public.savings_goals;
