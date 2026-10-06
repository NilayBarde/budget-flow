-- Migration: record why an account's last sync failed
-- Run this in the Supabase SQL editor BEFORE deploying the code that reads and writes it.
-- The sync-health endpoint selects these columns and every successful sync clears them, so
-- deploying first would make both fail until the columns exist.
--
-- last_sync_error is a short, credential-free reason ("ITEM_LOGIN_REQUIRED: ..." or the message of
-- a failed save). It is set when a sync fails and cleared by the next successful sync, so the
-- dashboard can show the real reason instead of a vague "stale" warning.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_error_at TIMESTAMPTZ;
