-- Generic key-value settings table for app-wide preferences
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with default expected monthly income
INSERT INTO app_settings (key, value) VALUES ('expected_monthly_income', '0');
