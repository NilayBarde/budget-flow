-- Migration: allow at most one settlement row per (split, Venmo transaction) pair.
-- Run this in the Supabase SQL editor. Safe before or after deploying the code: the code never
-- means to write a duplicate pair, so this only turns an accidental one into an error.
--
-- Two reconcile runs can overlap (a manual sync and a Plaid webhook both finish and both run the
-- Venmo matcher). If both compute the same match, both would insert its settlement rows, and the
-- split would look settled twice over. With this constraint the second insert fails instead, and
-- the matcher's caller logs it without failing the sync.
--
-- If this fails because duplicates already exist, keep the oldest row of each pair first:
--   DELETE FROM transaction_split_settlements a
--     USING transaction_split_settlements b
--     WHERE a.split_id = b.split_id
--       AND a.venmo_transaction_id = b.venmo_transaction_id
--       AND (a.created_at, a.id) > (b.created_at, b.id);

ALTER TABLE transaction_split_settlements
  ADD CONSTRAINT transaction_split_settlements_split_venmo_unique
  UNIQUE (split_id, venmo_transaction_id);
