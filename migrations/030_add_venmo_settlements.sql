-- Migration: track which Venmo transactions settle which transaction_splits.
-- Run this in the Supabase SQL editor before deploying the code that reads/writes it.
--
-- Purely additive: no existing column changes meaning, no backfill. A split's settled
-- amount is always derived (SUM(amount) FROM transaction_split_settlements WHERE
-- split_id = ?), never stored on transaction_splits itself, so this migration cannot
-- alter the result of any existing split calculation.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_venmo_settlement BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS transaction_split_settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_id UUID NOT NULL REFERENCES transaction_splits(id) ON DELETE CASCADE,
  venmo_transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_split_settlements_split_id
  ON transaction_split_settlements(split_id);
CREATE INDEX IF NOT EXISTS idx_split_settlements_venmo_transaction_id
  ON transaction_split_settlements(venmo_transaction_id);

ALTER TABLE transaction_split_settlements ENABLE ROW LEVEL SECURITY;
