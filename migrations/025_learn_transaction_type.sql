-- Let merchant mappings remember the transaction type the user picked, not just the category.
-- Without this, every sync re-derives the type from the raw bank text, so a merchant whose
-- description matches a transfer pattern (e.g. Empower) reverts to 'transfer' on every sync.

ALTER TABLE merchant_mappings
ADD COLUMN IF NOT EXISTS default_transaction_type TEXT DEFAULT NULL;

ALTER TABLE merchant_mappings
DROP CONSTRAINT IF EXISTS merchant_mappings_default_transaction_type_check;

ALTER TABLE merchant_mappings
ADD CONSTRAINT merchant_mappings_default_transaction_type_check
CHECK (default_transaction_type IS NULL OR default_transaction_type IN ('income', 'expense', 'transfer', 'investment', 'return'));

-- Marks transactions whose type the user set by hand, so Plaid's "modified" sync
-- updates amount/date/pending without overwriting the corrected type.
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS type_manually_set BOOLEAN DEFAULT false;
