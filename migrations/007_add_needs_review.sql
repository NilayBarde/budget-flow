-- Add needs_review column to transactions table
-- This flag indicates transactions that couldn't be confidently categorized
-- and should be reviewed by the user

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false;

-- Add plaid_category column to store Plaid's personal_finance_category
-- This allows us to re-run categorization with improved logic later
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS plaid_category JSONB DEFAULT NULL;

-- Create index for filtering transactions that need review
CREATE INDEX IF NOT EXISTS idx_transactions_needs_review 
ON transactions (needs_review) 
WHERE needs_review = true;

-- Mark all existing uncategorized transactions (category_id is null and type is expense) as needs_review
UPDATE transactions 
SET needs_review = true 
WHERE category_id IS NULL 
  AND transaction_type = 'expense';
