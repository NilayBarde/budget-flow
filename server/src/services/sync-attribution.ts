// Plaid's /transactions/sync endpoint is item-level: a single call returns
// transactions for every account (card) under the item, each tagged with its
// own per-card `account_id`. When an item has more than one account (e.g. an
// Amex login holding both a Gold and a Platinum card), transactions must be
// attributed to the correct local account row by that `account_id`.
//
// Without this, the previous sync logic inserted every transaction under
// whichever local row triggered the sync, so one card's account absorbed both
// cards' charges (distributed by sync timing rather than by card).

interface ItemAccount {
  id: string;
  plaid_account_id: string | null;
}

/**
 * Build a resolver mapping a Plaid transaction's `account_id` to the local
 * account row id. Falls back to `triggeringAccountId` (the row that initiated
 * the sync) when the Plaid account_id is unknown — this preserves correct
 * behavior for single-account items and is a safe default.
 */
export const buildAccountResolver = (
  itemAccounts: ItemAccount[],
  triggeringAccountId: string
) => {
  const byPlaidId = new Map<string, string>();
  for (const account of itemAccounts) {
    if (account.plaid_account_id) {
      byPlaidId.set(account.plaid_account_id, account.id);
    }
  }

  return (plaidAccountId?: string | null): string =>
    (plaidAccountId && byPlaidId.get(plaidAccountId)) || triggeringAccountId;
};
