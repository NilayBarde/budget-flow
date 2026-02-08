-- Add csv_reference column to transactions table
-- Stores the unique reference/confirmation number from CSV bank exports
-- Used alongside plaid_transaction_id for duplicate detection

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS csv_reference TEXT;

-- Index for efficient duplicate lookups by reference
CREATE INDEX IF NOT EXISTS idx_transactions_csv_reference
ON transactions (csv_reference)
WHERE csv_reference IS NOT NULL;
