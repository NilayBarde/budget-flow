import { isManualToken } from './account-types.js';

// Plaid bills every connection (Item) monthly whether or not it brings anything in, so a connection
// that has gone quiet is worth a nudge to disconnect it. Judged per connection, not per account,
// because that is what Plaid bills and what Disconnect acts on.

export const IDLE_DAYS = 60;
/** How long "Keep" silences the nudge before it asks again */
export const IDLE_SNOOZE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IdleCheckAccount {
  id: string;
  plaid_item_id: string;
  plaid_access_token: string;
  created_at: string;
  idle_snoozed_until?: string | null;
  /** Date (YYYY-MM-DD) of the account's newest transaction, pending included, or null if it has none */
  last_transaction_date: string | null;
}

export interface IdleConnection {
  /** Newest transaction date across the connection's accounts, or null if none ever arrived */
  last_activity: string | null;
}

/**
 * The accounts on idle Plaid connections, keyed by account id. A connection is idle when it was
 * linked at least IDLE_DAYS ago (so a new card has time to be used), none of its accounts has had a
 * transaction in the last IDLE_DAYS, and the user has not snoozed it. Manual and disconnected
 * accounts are never idle: Plaid does not bill them.
 */
export const findIdleConnections = (accounts: IdleCheckAccount[], now: number): Map<string, IdleConnection> => {
  const cutoff = now - IDLE_DAYS * DAY_MS;
  const cutoffDate = new Date(cutoff).toISOString().slice(0, 10);

  const connections = new Map<string, IdleCheckAccount[]>();
  for (const account of accounts) {
    if (isManualToken(account.plaid_access_token)) continue;
    connections.set(account.plaid_item_id, [...(connections.get(account.plaid_item_id) ?? []), account]);
  }

  const idle = new Map<string, IdleConnection>();
  for (const members of connections.values()) {
    // Measured from the oldest account, so an account Plaid adds later does not restart the clock
    const linkedAt = Math.min(...members.map(a => Date.parse(a.created_at)));
    if (linkedAt > cutoff) continue;

    // "Keep" snoozes every account on the connection together; any live snooze counts
    if (members.some(a => a.idle_snoozed_until && Date.parse(a.idle_snoozed_until) > now)) continue;

    const dates = members.map(a => a.last_transaction_date).filter((d): d is string => Boolean(d));
    const lastActivity = dates.length > 0 ? dates.sort().at(-1)! : null;
    if (lastActivity && lastActivity >= cutoffDate) continue;

    for (const account of members) idle.set(account.id, { last_activity: lastActivity });
  }
  return idle;
};
