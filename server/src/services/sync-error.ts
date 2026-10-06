import { supabase } from '../db/supabase.js';
import { redactError } from './plaid-errors.js';

// Long enough for a Plaid message, short enough that one runaway error cannot fill a row.
export const SYNC_ERROR_MAX_LENGTH = 300;
const FALLBACK_MESSAGE = 'Sync failed';

/**
 * The reason a sync failed, as text that is safe to store and show. Goes through redactError so an
 * axios error collapses to "CODE: message" instead of carrying the request headers, and a database
 * error to its code and message without the failing row.
 */
export const describeSyncError = (error: unknown): string => {
  const redacted = redactError(error);
  const text =
    typeof redacted === 'string'
      ? redacted
      : redacted instanceof Error
        ? redacted.message
        : '';
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, SYNC_ERROR_MAX_LENGTH) : FALLBACK_MESSAGE;
};

/**
 * Remember why the last sync of an item failed, so the app can show the reason instead of a vague
 * "stale" warning. It never throws: it runs while another error is already being handled, and a
 * failed write here must not replace that error.
 */
export const recordSyncFailure = async (plaidItemId: string | null | undefined, error: unknown): Promise<void> => {
  if (!plaidItemId) return;

  const { error: writeError } = await supabase
    .from('accounts')
    .update({ last_sync_error: describeSyncError(error), last_sync_error_at: new Date().toISOString() })
    .eq('plaid_item_id', plaidItemId);

  if (writeError) console.error(`Could not record the sync failure for item ${plaidItemId}:`, redactError(writeError));
};
