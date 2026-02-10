-- Migration: Add last_csv_import_at to accounts table
-- Used by holdings import to track when the last import occurred
-- (Transaction CSV imports track this via the csv_imports table, but holdings imports need their own timestamp)

ALTER TABLE accounts ADD COLUMN last_csv_import_at TIMESTAMPTZ;
