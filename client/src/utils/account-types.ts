import type { Account } from '../types';

// Manual (non-Plaid) accounts are created with a plaid_item_id of "manual-<id>". The server never
// sends the Plaid access token to the browser, so the item id is the only signal available.
export const isManualAccount = (account: Pick<Account, 'plaid_item_id'>): boolean =>
  account.plaid_item_id.startsWith('manual-');
