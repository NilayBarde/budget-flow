-- Migration: Add CSV imports tracking
-- This allows users to see import history and undo specific imports

-- CSV imports table to track each import session
CREATE TABLE csv_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add import_id to transactions to link them to their import
ALTER TABLE transactions ADD COLUMN import_id UUID REFERENCES csv_imports(id) ON DELETE CASCADE;

-- Index for efficient lookups
CREATE INDEX idx_csv_imports_account_id ON csv_imports(account_id);
CREATE INDEX idx_transactions_import_id ON transactions(import_id);
