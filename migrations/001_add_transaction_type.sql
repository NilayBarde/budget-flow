-- Migration: Add transaction_type and original_description columns
-- Run this in Supabase SQL Editor if you have an existing database

-- Add the transaction_type column
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS transaction_type TEXT DEFAULT 'expense' 
CHECK (transaction_type IN ('income', 'expense', 'transfer'));

-- Add original_description column to store full bank description
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS original_description TEXT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);

-- Migrate existing transactions based on amount sign and patterns
-- Income: negative amounts (money coming in)
UPDATE transactions 
SET transaction_type = 'income' 
WHERE amount < 0 AND transaction_type = 'expense';

-- Transfers: detect common transfer patterns
UPDATE transactions 
SET transaction_type = 'transfer' 
WHERE transaction_type = 'expense' 
AND (
  LOWER(merchant_name) LIKE '%payment thank you%'
  OR LOWER(merchant_name) LIKE '%autopay%'
  OR LOWER(merchant_name) LIKE '%credit card payment%'
  OR LOWER(merchant_name) LIKE '%credit crd%'
  OR LOWER(merchant_name) LIKE '%crd autopay%'
  OR LOWER(merchant_name) LIKE '%epayment%'
  OR LOWER(merchant_name) LIKE '%e-payment%'
  OR LOWER(merchant_name) LIKE '%transfer to%'
  OR LOWER(merchant_name) LIKE '%transfer from%'
  OR LOWER(merchant_name) LIKE '%online transfer%'
  OR LOWER(merchant_name) LIKE '%ach transfer%'
  OR LOWER(merchant_name) LIKE '%wire transfer%'
  OR LOWER(merchant_name) LIKE '%bill pay%'
  OR LOWER(merchant_name) LIKE '%billpay%'
  OR LOWER(merchant_name) LIKE '%loan payment%'
  OR LOWER(merchant_name) LIKE '%mortgage payment%'
  OR LOWER(merchant_name) LIKE '% pmt %'
  OR LOWER(merchant_name) LIKE '%internet transfer%'
  OR LOWER(merchant_name) LIKE '%mobile transfer%'
  OR LOWER(merchant_name) LIKE '%zelle%'
  OR LOWER(merchant_name) = 'payment'
  OR LOWER(merchant_name) = 'cash app'
  -- Note: Venmo intentionally excluded - users often receive reimbursements via Venmo
);
