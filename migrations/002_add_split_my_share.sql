-- Migration: Add is_my_share to transaction_splits
-- Run this in Supabase SQL Editor

-- Add is_my_share column to track which splits count toward your expenses
-- Default TRUE because typically your portion is what you want to track
ALTER TABLE transaction_splits 
ADD COLUMN IF NOT EXISTS is_my_share BOOLEAN DEFAULT TRUE;

-- Update existing splits: first split is typically "your portion"
-- You may need to manually adjust existing splits after this migration
