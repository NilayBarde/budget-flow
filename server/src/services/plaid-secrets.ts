import { supabaseAdmin } from '../db/supabase.js';

// The only code that reads or writes Plaid credentials (plaid_access_token, plaid_cursor). Signed-in
// users can't read or write those columns (migration 030), so this runs as the service role and
// always narrows by user itself.

export interface ItemAccount {
  id: string;
  user_id: string;
  plaid_item_id: string;
  plaid_access_token: string;
  plaid_cursor: string | null;
  plaid_account_id: string | null;
  account_type: string | null;
  institution_name: string;
}

const ITEM_ACCOUNT_COLUMNS =
  'id, user_id, plaid_item_id, plaid_access_token, plaid_cursor, plaid_account_id, account_type, institution_name';

/**
 * Every account under a Plaid item, with its owner and credentials. For Plaid webhooks, which name
 * only the item: the caller must check that all rows share one owner before acting for that owner.
 */
export const getItemAccounts = async (plaidItemId: string): Promise<ItemAccount[]> => {
  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select(ITEM_ACCOUNT_COLUMNS)
    .eq('plaid_item_id', plaidItemId);
  if (error) throw error;
  return (data ?? []) as ItemAccount[];
};

/**
 * The one user an item's accounts belong to, or null when there are none or they disagree. A
 * webhook acts as this user; with no single owner it must not act at all, rather than mix two
 * users' data in one sync.
 */
export const itemOwner = (accounts: Pick<ItemAccount, 'user_id'>[]): string | null => {
  const owners = new Set(accounts.map(account => account.user_id));
  return owners.size === 1 ? [...owners][0] : null;
};

/** Save the item's sync cursor on all of the user's accounts under it, keeping them in step. */
export const saveCursor = async (userId: string, plaidItemId: string, cursor: string): Promise<void> => {
  const { error } = await supabaseAdmin
    .from('accounts')
    .update({ plaid_cursor: cursor })
    .eq('user_id', userId)
    .eq('plaid_item_id', plaidItemId);
  if (error) throw error;
};
