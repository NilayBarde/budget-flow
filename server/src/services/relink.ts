// Re-linking a bank through Plaid Link (not update mode) creates a brand new Item with new account
// and transaction ids. Plaid bills every Item every month, so the old one has to be removed, and the
// accounts and transactions we already store have to carry over instead of being duplicated.

export interface StoredPlaidAccount {
  id: string;
  plaid_account_id: string;
  plaid_item_id: string;
  plaid_access_token: string;
  account_name: string;
  account_type: string;
}

export interface LinkedPlaidAccount {
  account_id: string;
  name: string;
  type: string;
  subtype?: string | null;
}

const accountKey = (name: string, type: string) => `${name.trim().toLowerCase()}|${type.trim().toLowerCase()}`;

/**
 * Pairs each account Plaid just linked with the stored account it replaces, keyed by the new Plaid
 * account id. `stored` should be this institution's accounts on other Items.
 *
 * Plaid keeps the account id across a re-link only sometimes, so an account with no id match falls
 * back to its name and type. That fallback only pairs when exactly one stored and one new account
 * share the name and type, so two look-alike accounts are never guessed between.
 */
export const matchRelinkedAccounts = (
  linked: LinkedPlaidAccount[],
  stored: StoredPlaidAccount[],
): Map<string, StoredPlaidAccount> => {
  const matches = new Map<string, StoredPlaidAccount>();
  const used = new Set<string>();

  for (const account of linked) {
    const sameId = stored.find(s => s.plaid_account_id === account.account_id);
    if (sameId) {
      matches.set(account.account_id, sameId);
      used.add(sameId.id);
    }
  }

  const typeOf = (a: LinkedPlaidAccount) => a.subtype || a.type || 'unknown';
  const unmatchedLinked = linked.filter(a => !matches.has(a.account_id));
  const unmatchedStored = stored.filter(s => !used.has(s.id));
  for (const account of unmatchedLinked) {
    const key = accountKey(account.name || 'Account', typeOf(account));
    const linkedTwins = unmatchedLinked.filter(a => accountKey(a.name || 'Account', typeOf(a)) === key);
    const storedTwins = unmatchedStored.filter(s => accountKey(s.account_name, s.account_type) === key);
    if (linkedTwins.length === 1 && storedTwins.length === 1) {
      matches.set(account.account_id, storedTwins[0]);
    }
  }

  return matches;
};

export interface AdoptionCandidate {
  id: string;
  plaid_transaction_id: string | null;
  original_description: string | null;
}

/**
 * Picks the stored transaction (same account, date and amount, from the old Item) that a
 * re-linked Item's transaction is the same as. A matching description wins. Without one, a
 * lone candidate is taken. Rows already adopted in this sync are never picked twice, so two
 * identical charges on one day each keep their own row.
 */
export const pickAdoptableTransaction = (
  description: string,
  candidates: AdoptionCandidate[],
  adopted: ReadonlySet<string>,
): AdoptionCandidate | undefined => {
  const open = candidates.filter(c => c.plaid_transaction_id && !adopted.has(c.id));
  return open.find(c => c.original_description === description) ?? (open.length === 1 ? open[0] : undefined);
};
