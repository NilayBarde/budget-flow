-- Migration: let a transaction be marked as one that should not be split
-- Run this in the Supabase SQL editor BEFORE deploying the code that reads and writes it.
-- The "Possible missed splits" card filters on this column and its "Don't split" button writes
-- it, and pending reconciliation selects it, so deploying first would make the last of those
-- fail until the column exists.
--
-- A large expense that was never split shows on the dashboard as a possible missed split. Rent or
-- a solo purchase never will be, so the user can mark it and it stops being listed.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS split_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
