-- BudgetFlow Database Schema
-- Baseline as of migration 023 (2026-08-04), generated from the live schema
-- (PostgREST introspection) plus the index/RLS statements from migrations
-- 001-023. Fresh setups run ONLY this file in the Supabase SQL editor, then
-- apply any migrations numbered 024 and higher.
--
-- Notes:
-- - transactions.transaction_type is nullable in the live schema (the code
--   falls back on amount sign when null); kept nullable here for fidelity.
-- - The securities/holdings tables (migration 011) and the balance-alert
--   columns (migration 010) never existed in the live database and are not
--   part of this baseline.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Accounts table (linked bank accounts)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL DEFAULT 'default-user',
  plaid_item_id TEXT NOT NULL,
  plaid_access_token TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  plaid_cursor TEXT,
  historical_sync_complete BOOLEAN DEFAULT FALSE,
  current_balance NUMERIC,
  plaid_account_id TEXT,
  exclude_from_investments BOOLEAN DEFAULT FALSE,
  investment_exclusion_note TEXT,
  last_csv_import_at TIMESTAMPTZ,
  needs_reauth BOOLEAN NOT NULL DEFAULT FALSE,
  reauth_detected_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE
);

-- Insert default categories
INSERT INTO categories (name, icon, color, is_default) VALUES
  ('Housing', 'home', '#0ea5e9', TRUE),
  ('Dining', 'utensils', '#f97316', TRUE),
  ('Groceries', 'shopping-cart', '#22c55e', TRUE),
  ('Transportation', 'car', '#3b82f6', TRUE),
  ('Entertainment', 'film', '#a855f7', TRUE),
  ('Shopping', 'shopping-bag', '#ec4899', TRUE),
  ('Utilities', 'zap', '#eab308', TRUE),
  ('Subscriptions', 'repeat', '#6366f1', TRUE),
  ('Travel', 'plane', '#14b8a6', TRUE),
  ('Healthcare', 'heart-pulse', '#ef4444', TRUE),
  ('Income', 'wallet', '#10b981', TRUE),
  ('Investment', 'trending-up', '#8b5cf6', TRUE),
  ('Other', 'more-horizontal', '#64748b', TRUE);

-- CSV imports table (tracks each import session; transactions link back via import_id)
CREATE TABLE csv_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  plaid_transaction_id TEXT UNIQUE,
  csv_reference TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  date DATE NOT NULL,
  merchant_name TEXT NOT NULL,
  merchant_display_name TEXT,
  original_description TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  transaction_type TEXT DEFAULT 'expense' CHECK (transaction_type IN ('income', 'expense', 'transfer', 'investment', 'return')),
  is_split BOOLEAN DEFAULT FALSE,
  parent_transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  is_recurring BOOLEAN DEFAULT FALSE,
  needs_review BOOLEAN DEFAULT FALSE,
  pending BOOLEAN DEFAULT FALSE,
  plaid_category JSONB,
  import_id UUID REFERENCES csv_imports(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Budget goals table
CREATE TABLE budget_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  limit_amount NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (category_id, month, year)
);

-- Transaction splits table
CREATE TABLE transaction_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  description TEXT,
  is_my_share BOOLEAN DEFAULT TRUE,  -- Only splits marked as my_share count toward totals
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Merchant mappings table (for cleaning up merchant names)
CREATE TABLE merchant_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  default_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tags table
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transaction tags junction table
CREATE TABLE transaction_tags (
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

-- Recurring transactions table
CREATE TABLE recurring_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_display_name TEXT NOT NULL UNIQUE,
  average_amount NUMERIC(12, 2) NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  last_seen DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- App settings table (generic key-value preferences)
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_merchant_name ON transactions(merchant_name);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_pending ON transactions(pending);
CREATE INDEX idx_transactions_import_id ON transactions(import_id);
CREATE INDEX idx_transactions_needs_review ON transactions(needs_review) WHERE needs_review = TRUE;
CREATE INDEX idx_transactions_csv_reference ON transactions(csv_reference) WHERE csv_reference IS NOT NULL;
CREATE INDEX idx_transaction_splits_parent_transaction_id ON transaction_splits(parent_transaction_id);
CREATE INDEX idx_transaction_tags_tag_id ON transaction_tags(tag_id);
CREATE INDEX idx_budget_goals_month_year ON budget_goals(month, year);
CREATE INDEX idx_recurring_transactions_merchant ON recurring_transactions(merchant_display_name);
CREATE INDEX idx_csv_imports_account_id ON csv_imports(account_id);
CREATE UNIQUE INDEX idx_accounts_unique_plaid_account_id
  ON accounts(plaid_account_id)
  WHERE plaid_account_id IS NOT NULL;

-- Row Level Security (migration 019): the Express server uses the
-- service-role key which bypasses RLS; enabling it blocks direct anon-key
-- access. No permissive policies are needed.
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
