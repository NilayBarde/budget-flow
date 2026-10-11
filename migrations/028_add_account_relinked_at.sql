-- Migration: remember when an account was carried over to a re-linked Plaid Item
-- Run this in the Supabase SQL editor BEFORE deploying the code that reads and writes it.
-- Every Plaid sync selects this column, so deploying first would make syncs fail until it exists.
--
-- Re-linking a bank creates a new Plaid Item that sends the whole history again under new
-- transaction ids, spread over several syncs. While relinked_at is set, each sync re-keys the rows
-- stored before that time instead of inserting duplicates. It is cleared once Plaid reports the
-- history complete.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS relinked_at TIMESTAMPTZ;
