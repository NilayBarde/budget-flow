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
  mask?: string | null;
  type: string;
  subtype?: string | null;
}

const typeOf = (a: Pick<LinkedPlaidAccount, 'type' | 'subtype'>) => a.subtype || a.type || 'unknown';
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Pairs each account Plaid just linked with the stored account it replaces, keyed by the new Plaid
 * account id. `stored` holds candidate accounts on other Items.
 *
 * Plaid keeps the account id across a re-link only sometimes, so an account with no id match falls
 * back to what Plaid says the account is. `oldPlaidAccounts` is what the old Item still reports for
 * its accounts (keyed by their Plaid id): when it is there, name, mask and type must all agree, so a
 * renamed account still pairs and a second login with a look-alike account does not. When the old
 * Item can no longer be read (the usual reason to re-link), the stored name and type stand in.
 * Either way a pair is only made when exactly one account on each side matches.
 */
export const matchRelinkedAccounts = (
  linked: LinkedPlaidAccount[],
  stored: StoredPlaidAccount[],
  oldPlaidAccounts: ReadonlyMap<string, LinkedPlaidAccount> = new Map(),
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

  // The key an account is recognized by. With the old Item's own data the mask joins the key; without
  // it, a stored account can only be compared on name and type.
  const linkedKey = (a: LinkedPlaidAccount, withMask: boolean) =>
    `${norm(a.name || 'Account')}|${norm(typeOf(a))}${withMask ? `|${norm(a.mask)}` : ''}`;
  const storedKey = (s: StoredPlaidAccount) => {
    const old = oldPlaidAccounts.get(s.plaid_account_id);
    return old ? { key: linkedKey(old, true), withMask: true } : { key: `${norm(s.account_name)}|${norm(s.account_type)}`, withMask: false };
  };

  const unmatchedLinked = linked.filter(a => !matches.has(a.account_id));
  const unmatchedStored = stored.filter(s => !used.has(s.id)).map(s => ({ s, ...storedKey(s) }));
  for (const account of unmatchedLinked) {
    const candidates = unmatchedStored.filter(c => c.key === linkedKey(account, c.withMask));
    if (candidates.length !== 1) continue;
    const { key, withMask } = candidates[0];
    const linkedTwins = unmatchedLinked.filter(a => linkedKey(a, withMask) === key);
    if (linkedTwins.length === 1) matches.set(account.account_id, candidates[0].s);
  }

  return matches;
};

export interface AdoptionCandidate {
  id: string;
  plaid_transaction_id: string | null;
  original_description: string | null;
}

// The first letters of a description, which survive the small rewrites a bank makes between feeds
// ("UBER *TRIP 8XK2" and "UBER TRIP") while still telling Uber from Whole Foods.
const descriptionHead = (description: string | null) => norm(description).replace(/[^a-z]/g, '').slice(0, 4);

/**
 * Picks the stored transaction (same account, date and amount, stored before the re-link) that a
 * re-linked Item's transaction is the same as. That includes rows CSV imported while the account
 * was disconnected. An identical description wins. Otherwise a lone
 * candidate is taken only when its description starts the same way. Rows already adopted are never
 * picked twice, so two identical charges on one day each keep their own row.
 */
export const pickAdoptableTransaction = (
  description: string,
  candidates: AdoptionCandidate[],
  adopted: ReadonlySet<string>,
): AdoptionCandidate | undefined => {
  const open = candidates.filter(c => !adopted.has(c.id));
  const exact = open.find(c => c.original_description === description);
  if (exact) return exact;
  if (open.length !== 1) return undefined;
  const head = descriptionHead(description);
  return head && descriptionHead(open[0].original_description) === head ? open[0] : undefined;
};

/** The key adoption candidates are grouped under: one account, one day, one amount. */
export const adoptionKey = (accountId: string, date: string, amount: number) => `${accountId}|${date}|${Number(amount).toFixed(2)}`;
