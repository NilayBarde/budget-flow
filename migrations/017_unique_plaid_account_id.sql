-- Prevent duplicate accounts when relinking the same bank
-- plaid_account_id is the stable identifier from Plaid that persists across relinks
-- NULL values are allowed (manual accounts don't have a plaid_account_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_unique_plaid_account_id 
  ON accounts(plaid_account_id) 
  WHERE plaid_account_id IS NOT NULL;
