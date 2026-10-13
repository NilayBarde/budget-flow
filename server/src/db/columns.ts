// The accounts columns a signed-in user may read: migration 030 grants SELECT on exactly these.
// plaid_access_token and plaid_cursor are deliberately absent; read them with the service-role client.
// A migration that adds an accounts column must grant it and add it here (test:migrations compares).
export const ACCOUNT_COLUMN_LIST = [
  'id',
  'user_id',
  'plaid_item_id',
  'institution_name',
  'account_name',
  'account_type',
  'historical_sync_complete',
  'current_balance',
  'plaid_account_id',
  'exclude_from_investments',
  'investment_exclusion_note',
  'last_csv_import_at',
  'needs_reauth',
  'reauth_detected_at',
  'last_synced_at',
  'created_at',
  'last_sync_error',
  'last_sync_error_at',
  'relinked_at',
  'idle_snoozed_until',
  'is_manual',
] as const;

export const ACCOUNT_COLUMNS = ACCOUNT_COLUMN_LIST.join(', ');
