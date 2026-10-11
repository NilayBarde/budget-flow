import type { Account } from '../types';

// Manual (non-Plaid) accounts are created with a plaid_item_id of "manual-<id>". The server never
// sends the Plaid access token to the browser, so the item id is the only signal available.
export const isManualAccount = (account: Pick<Account, 'plaid_item_id'>): boolean =>
  account.plaid_item_id.startsWith('manual-');

// A Plaid account the user disconnected (Disconnect, keeps history) is manual now but still remembers
// its Plaid account id, which an account created by hand never has.
export const isDisconnectedAccount = (account: Pick<Account, 'plaid_item_id' | 'plaid_account_id'>): boolean =>
  isManualAccount(account) && Boolean(account.plaid_account_id);
