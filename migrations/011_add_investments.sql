-- Migration: Add investment tracking tables
-- Run this in Supabase SQL Editor

-- Securities table - stores security metadata from Plaid
CREATE TABLE securities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plaid_security_id TEXT UNIQUE NOT NULL,
  ticker_symbol TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- e.g., 'equity', 'etf', 'mutual fund', 'cash', 'cryptocurrency'
  close_price DECIMAL(12, 4),
  close_price_as_of DATE,
  iso_currency_code TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Holdings table - stores user holdings linked to accounts and securities
CREATE TABLE holdings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  security_id UUID NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  quantity DECIMAL(18, 8) NOT NULL,
  cost_basis DECIMAL(12, 2),
  institution_value DECIMAL(12, 2), -- Value reported by institution
  iso_currency_code TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (account_id, security_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_securities_ticker ON securities(ticker_symbol);
CREATE INDEX idx_securities_plaid_id ON securities(plaid_security_id);
CREATE INDEX idx_holdings_account_id ON holdings(account_id);
CREATE INDEX idx_holdings_security_id ON holdings(security_id);
