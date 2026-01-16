-- Add cursor column to accounts table for Plaid transactions sync
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS plaid_cursor TEXT;

-- Add column to track when historical sync is complete
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS historical_sync_complete BOOLEAN DEFAULT FALSE;
