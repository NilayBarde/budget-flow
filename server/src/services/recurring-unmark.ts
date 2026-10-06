// What to write on the recurring_transactions row when the last flagged
// transaction of a merchant is unmarked.
//
// Detected series are only deactivated: hiding them would permanently block
// detection of the merchant (and drop it from fixed costs), even though the
// user only corrected one mis-flagged charge. Manual series exist purely
// because the user flagged them, so unflagging the last charge is a deletion
// and detection must not resurrect it.
export interface UnmarkUpdate {
  is_active: false;
  user_hidden?: true;
}

export const recurringUnmarkUpdate = (source: string | null | undefined): UnmarkUpdate =>
  source === 'manual' ? { is_active: false, user_hidden: true } : { is_active: false };
