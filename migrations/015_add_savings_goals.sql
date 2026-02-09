-- Add savings_goals table for long-term financial goals
CREATE TABLE savings_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  target_amount DECIMAL(12, 2) NOT NULL,
  current_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  monthly_contribution DECIMAL(12, 2) NOT NULL DEFAULT 0,
  icon TEXT NOT NULL DEFAULT 'piggy-bank',
  color TEXT NOT NULL DEFAULT '#6366f1',
  deadline DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_savings_goals_created ON savings_goals(created_at);
