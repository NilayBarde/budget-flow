-- Migration: Add ability to exclude accounts from investments
-- Run this in Supabase SQL Editor

-- Add exclude_from_investments column to accounts table
-- Use this to hide unvested RSU accounts, stock option plans, or other "potential" equity accounts
ALTER TABLE accounts ADD COLUMN exclude_from_investments BOOLEAN DEFAULT FALSE;

-- Add a note field to explain why something is excluded
ALTER TABLE accounts ADD COLUMN investment_exclusion_note TEXT;
