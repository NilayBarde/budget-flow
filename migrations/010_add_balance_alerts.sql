-- Migration: Add balance alerts for credit cards
-- Tracks current balance and alert thresholds for Pushover notifications

-- Add balance tracking columns to accounts table
ALTER TABLE accounts ADD COLUMN current_balance DECIMAL(12, 2);
ALTER TABLE accounts ADD COLUMN balance_threshold DECIMAL(12, 2);
ALTER TABLE accounts ADD COLUMN last_balance_alert_at TIMESTAMPTZ;

-- Add Plaid account ID to properly map transactions to accounts
-- (Each Plaid Item can have multiple accounts, each with their own account_id)
ALTER TABLE accounts ADD COLUMN plaid_account_id TEXT;

-- Index for efficient queries on accounts with thresholds set
CREATE INDEX idx_accounts_balance_threshold ON accounts(balance_threshold) WHERE balance_threshold IS NOT NULL;

-- Index for looking up accounts by Plaid account ID
CREATE INDEX idx_accounts_plaid_account_id ON accounts(plaid_account_id) WHERE plaid_account_id IS NOT NULL;
