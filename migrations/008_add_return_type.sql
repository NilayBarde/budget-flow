-- Migration: Add 'return' transaction type for tracking refunds/returns
-- Returns are tracked as expenses in their category but reduce the total spent

-- Update the transaction_type constraint to include 'return'
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;

ALTER TABLE transactions ADD CONSTRAINT transactions_transaction_type_check 
  CHECK (transaction_type IN ('income', 'expense', 'transfer', 'investment', 'return'));

-- Reclassify existing transactions that are likely returns (negative amounts that aren't actual income)
-- This targets transactions with negative amounts that:
-- 1. Don't have INCOME as their Plaid category primary
-- 2. Aren't already classified as income, transfer, or investment
UPDATE transactions
SET transaction_type = 'return'
WHERE amount < 0
  AND transaction_type = 'income'
  AND (
    plaid_category IS NULL 
    OR plaid_category->>'primary' IS NULL 
    OR plaid_category->>'primary' != 'INCOME'
  );
