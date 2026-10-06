import { isHoldingsAccountType } from './account-types.js';

// Cards and bank accounts see new activity all the time, so a quiet week is suspicious.
// Investment and retirement accounts barely move, so they get a longer window before
// the dashboard nags about them.
export const DEFAULT_STALE_DAYS = 5;
export const INVESTMENT_STALE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

interface SyncHealthAccount {
  account_type?: string | null;
  needs_reauth: boolean;
  last_synced_at: string | null;
}

// The ?staleDays= override is a debugging aid. It must be a plain decimal number inside a sane
// range: hex, exponents, negatives and huge values would flag every account as stale or none of
// them (1e308 days overflows the cutoff to -Infinity).
const MIN_STALE_DAYS = 0.01;
const MAX_STALE_DAYS = 3650;

export const parseStaleDaysOverride = (value: unknown): number | undefined => {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : null;
  if (text === null || !/^\d+(\.\d+)?$/.test(text)) return undefined;
  const days = Number(text);
  return days >= MIN_STALE_DAYS && days <= MAX_STALE_DAYS ? days : undefined;
};

export const staleDaysFor = (accountType?: string | null, override?: number): number => {
  if (override) return override;
  return isHoldingsAccountType(accountType) ? INVESTMENT_STALE_DAYS : DEFAULT_STALE_DAYS;
};

/**
 * Split accounts into those that need the user to reconnect and those that have not synced
 * within their type's window. An account never synced counts as stale. Accounts already
 * flagged for re-auth are not listed twice.
 */
export const classifySyncHealth = <T extends SyncHealthAccount>(
  accounts: T[],
  now: number = Date.now(),
  staleDaysOverride?: number,
): { needsReauth: T[]; stale: T[] } => ({
  needsReauth: accounts.filter(a => a.needs_reauth),
  stale: accounts.filter(a => {
    if (a.needs_reauth) return false;
    if (!a.last_synced_at) return true;
    const syncedAt = new Date(a.last_synced_at).getTime();
    // An unreadable date is not evidence of a recent sync.
    if (Number.isNaN(syncedAt)) return true;
    return syncedAt < now - staleDaysFor(a.account_type, staleDaysOverride) * DAY_MS;
  }),
});
