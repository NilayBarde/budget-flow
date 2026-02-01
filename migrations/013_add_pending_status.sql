-- Add pending status to transactions
-- Plaid marks transactions as pending until they've fully posted to the account

ALTER TABLE transactions
ADD COLUMN pending BOOLEAN DEFAULT FALSE;

-- Index for filtering pending transactions
CREATE INDEX idx_transactions_pending ON transactions(pending);
