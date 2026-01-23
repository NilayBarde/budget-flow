-- Fix credit card payment transactions that were incorrectly categorized
-- This updates transactions matching credit card payment patterns to be transfers

-- First, update transaction_type for credit card payments
UPDATE transactions
SET transaction_type = 'transfer'
WHERE (
  -- Match credit card auto pay patterns
  LOWER(merchant_name) LIKE '%credit card%auto%pay%' OR
  LOWER(merchant_name) LIKE '%credit card-auto pay%' OR
  LOWER(merchant_name) LIKE '%credit card auto pay%' OR
  LOWER(original_description) LIKE '%credit card%auto%pay%' OR
  LOWER(original_description) LIKE '%credit card-auto pay%' OR
  LOWER(original_description) LIKE '%credit card auto pay%' OR
  -- Match other credit card payment patterns
  LOWER(merchant_name) LIKE '%credit card%payment%' OR
  LOWER(merchant_name) LIKE '%card%auto%pay%' OR
  LOWER(merchant_name) LIKE '%autopay%' OR
  LOWER(original_description) LIKE '%credit card%payment%' OR
  LOWER(original_description) LIKE '%card%auto%pay%' OR
  LOWER(original_description) LIKE '%autopay%'
)
AND transaction_type != 'transfer';

-- Clear categories for all transfer transactions (transfers shouldn't have expense categories)
UPDATE transactions
SET category_id = NULL
WHERE transaction_type = 'transfer'
AND category_id IS NOT NULL;
