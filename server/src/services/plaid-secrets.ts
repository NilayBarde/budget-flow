import { supabaseAdmin } from '../db/supabase.js';
import { ACCOUNT_COLUMNS } from '../db/columns.js';
import type { StoredPlaidAccount } from './relink.js';

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

/**
 * Save the item's sync cursor on all of the user's accounts under it, keeping them in step. null
 * clears it, so the next sync re-delivers the whole history.
 */
export const saveCursor = async (userId: string, plaidItemId: string, cursor: string | null): Promise<void> => {
  const { error } = await supabaseAdmin
    .from('accounts')
    .update({ plaid_cursor: cursor })
    .eq('user_id', userId)
    .eq('plaid_item_id', plaidItemId);
  if (error) throw error;
};

export interface AccountSecrets {
  plaid_item_id: string;
  plaid_access_token: string;
  plaid_cursor: string | null;
}

/** One of the user's accounts' Plaid credentials, or null when it isn't theirs or doesn't exist. */
export const getAccountSecrets = async (userId: string, accountId: string): Promise<AccountSecrets | null> => {
  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('plaid_item_id, plaid_access_token, plaid_cursor')
    .eq('user_id', userId)
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw error;
  return data as AccountSecrets | null;
};

/** The columns signed-in users can't write (migration 030): credentials and Plaid ids. */
export interface AccountCredentials {
  plaid_item_id?: string;
  plaid_access_token?: string;
  plaid_cursor?: string | null;
  plaid_account_id?: string | null;
}

/**
 * Write credentials (and, in the same update, any other fields) on one of the user's accounts. One
 * update keeps a re-link or disconnect from being half applied. user_id in `otherFields` is
 * dropped: an account never changes owner.
 */
export const updateAccountCredentials = async (
  userId: string,
  accountId: string,
  credentials: AccountCredentials,
  otherFields: Record<string, unknown> = {},
): Promise<void> => {
  const { user_id: _ignored, ...fields } = otherFields;
  const { error } = await supabaseAdmin
    .from('accounts')
    .update({ ...fields, ...credentials })
    .eq('user_id', userId)
    .eq('id', accountId);
  if (error) throw error;
};

/**
 * Create an account owned by the user. Every account insert comes through here: signed-in users
 * can't insert accounts, since a new row carries a Plaid token (or the 'manual' sentinel). Returns
 * the row without credentials.
 */
export const insertAccount = async (userId: string, row: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const { data, error } = await supabaseAdmin
    .from('accounts')
    .insert({ ...row, user_id: userId })
    .select(ACCOUNT_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as Record<string, unknown>;
};

const RELINK_COLUMNS = 'id, plaid_account_id, plaid_item_id, plaid_access_token, account_name, account_type';

/**
 * The user's stored accounts a new Plaid link may be replacing: any whose Plaid account id came back,
 * plus every account at the same institution. May list an account twice; the caller dedupes by id.
 */
export const findRelinkCandidates = async (
  userId: string,
  plaidAccountIds: string[],
  institutionName: string,
): Promise<StoredPlaidAccount[]> => {
  const [byId, byInstitution] = await Promise.all([
    supabaseAdmin.from('accounts').select(RELINK_COLUMNS).eq('user_id', userId).in('plaid_account_id', plaidAccountIds),
    supabaseAdmin.from('accounts').select(RELINK_COLUMNS).eq('user_id', userId).eq('institution_name', institutionName),
  ]);
  if (byId.error) throw byId.error;
  if (byInstitution.error) throw byInstitution.error;
  return [...(byId.data ?? []), ...(byInstitution.data ?? [])] as StoredPlaidAccount[];
};

/**
 * Whether another user already has any of these Plaid accounts. Plaid account ids are per Item, so
 * two people linking a joint account get different ids and this is almost never true; when it is,
 * the link is refused rather than taking the account over.
 */
export const plaidAccountsLinkedByOthers = async (userId: string, plaidAccountIds: string[]): Promise<boolean> => {
  if (plaidAccountIds.length === 0) return false;
  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('id')
    .neq('user_id', userId)
    .in('plaid_account_id', plaidAccountIds);
  if (error) throw error;
  return (data ?? []).length > 0;
};
