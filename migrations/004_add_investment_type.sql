-- Migration: Add 'investment' transaction type
-- Run this in Supabase SQL Editor

-- Drop the existing constraint
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;

-- Add the new constraint with 'investment' type
ALTER TABLE transactions ADD CONSTRAINT transactions_transaction_type_check 
  CHECK (transaction_type IN ('income', 'expense', 'transfer', 'investment'));

-- Remove the Investments category if it exists (it's now a transaction type)
DELETE FROM categories WHERE name = 'Investments';
