-- BudgetFlow Database Schema
-- Run this in your Supabase SQL Editor to set up the database

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

-- Transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  plaid_transaction_id TEXT UNIQUE,
  amount DECIMAL(12, 2) NOT NULL,
  date DATE NOT NULL,
  merchant_name TEXT NOT NULL,
  original_description TEXT,  -- Full transaction description from bank/Plaid
  merchant_display_name TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL DEFAULT 'expense' CHECK (transaction_type IN ('income', 'expense', 'transfer', 'investment')),
  is_split BOOLEAN DEFAULT FALSE,
  parent_transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  is_recurring BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Budget goals table
CREATE TABLE budget_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  limit_amount DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (category_id, month, year)
);

-- Transaction splits table
CREATE TABLE transaction_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
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
  average_amount DECIMAL(12, 2) NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  last_seen DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_merchant_name ON transactions(merchant_name);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_budget_goals_month_year ON budget_goals(month, year);
CREATE INDEX idx_recurring_transactions_merchant ON recurring_transactions(merchant_display_name);

-- Enable Row Level Security (optional, for multi-user support)
-- ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE budget_goals ENABLE ROW LEVEL SECURITY;
-- etc.

