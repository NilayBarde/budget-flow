-- Subscription net-cost feature: the recurring_transactions table becomes a
-- detection-managed inventory instead of a purely manual list.
--
-- source: 'manual' (user marked a transaction recurring) or 'detected'
--   (found by the recurring-detection service). Detection may update either.
-- user_hidden: the user's "hide this" preference, separated from is_active.
--   is_active now means "this series is still actually charging" and is
--   recomputed by detection; previously the hide button overloaded it.
-- offset_merchant_name / offset_monthly_amount: the matched recurring card
--   credit (e.g. "Platinum Walmart+ Credit") that offsets this charge, set by
--   detection so the UI can show net effective cost.

ALTER TABLE recurring_transactions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS user_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS offset_merchant_name TEXT,
  ADD COLUMN IF NOT EXISTS offset_monthly_amount NUMERIC(12, 2);

-- Rows previously deactivated via the Insights hide button were user intent,
-- not a statement about whether the merchant still charges. Preserve that
-- intent before detection recomputes is_active from actual data.
UPDATE recurring_transactions SET user_hidden = TRUE WHERE is_active = FALSE;
