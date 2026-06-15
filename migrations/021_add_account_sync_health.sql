-- Migration: add sync-health columns to accounts
-- Run this in the Supabase SQL editor BEFORE deploying the code that writes them.
--
-- Tracks whether a Plaid item needs re-authentication (common for OAuth banks
-- like American Express) and when each account last synced successfully, so the
-- app can surface "reconnect this account" prompts instead of silently going
-- stale.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reauth_detected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Manual (CSV) accounts never sync via Plaid, so they should never be flagged.
UPDATE accounts SET needs_reauth = FALSE WHERE plaid_access_token = 'manual';
