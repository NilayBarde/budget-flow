import { supabaseAdmin } from '../db/supabase.js';
import { removeItem } from './plaid.js';
import { redactError } from './plaid-errors.js';
import { isManualToken } from './account-types.js';

/**
 * Removes a Plaid Item once none of our accounts use its access token any more. Plaid bills every
 * Item monthly, but one Item can hold several accounts (a bank's checking and card), so removing it
 * while a sibling still uses it would cut that account off. Returns true when the Item was removed.
 * A failed removal is logged, not thrown: the local change has already happened.
 * Runs as the service role: it matches on the access token, which signed-in users can't read, and
 * a token belongs to exactly one item, so no user filter is needed to stay inside one user's data.
 */
export const removeItemIfUnused = async (accessToken: string): Promise<boolean> => {
  if (isManualToken(accessToken)) return false;

  const { count, error } = await supabaseAdmin
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('plaid_access_token', accessToken);
  if (error) {
    console.warn('Could not check whether a Plaid Item is still in use, so it was kept:', redactError(error));
    return false;
  }
  if ((count ?? 0) > 0) return false;

  try {
    await removeItem(accessToken);
    return true;
  } catch (plaidError) {
    console.warn('Could not remove item from Plaid:', redactError(plaidError));
    return false;
  }
};
