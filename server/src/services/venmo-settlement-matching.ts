// Pure helper (no DB deps) so it can be unit-tested in isolation, mirroring card-payment-pairing.
//
// A split only ever exists on a transaction the user themselves paid, so only one direction can
// occur: money arriving on the Venmo account (a negative amount, per this codebase's sign
// convention) settles an unsettled "others owe me" split. A Venmo send that matches nothing
// stays a normal expense — there is no "I owe them" matching path, because this app has no
// recorded transaction for an expense someone else paid.

export interface SplitCandidate {
  id: string;
  /** The parent transaction's date, for the lookback window check. */
  date: string;
  /** abs(split.amount) minus whatever is already settled against it. Always > 0. */
  remainingAmount: number;
}

export interface VenmoTransactionCandidate {
  id: string;
  /** Plaid sign: positive = money out, negative = money in. */
  amount: number;
  date: string;
  typeManuallySet?: boolean | null;
}

export interface SettlementMatch {
  venmoTransactionId: string;
  splitIds: string[];
  /** Amount applied to each split id, keyed by split id. */
  splitAmounts: Record<string, number>;
}

export const DEFAULT_WINDOW_DAYS = 21;
export const MAX_SPLITS_PER_MATCH = 5;
const AMOUNT_TOLERANCE_CENTS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
// Combinatorial search over unsettled splits is only tractable for small candidate pools.
const MAX_CANDIDATES_FOR_SUM_SEARCH = 20;

const toCents = (n: number): number => Math.round(Math.abs(n) * 100);
const daysBetween = (a: string, b: string): number => Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS;

/**
 * All combinations (up to maxSize splits) of candidates whose remainingAmount sums to
 * targetCents within tolerance. Stops searching as soon as a second distinct combination is
 * found, since an ambiguous match is treated the same as none.
 */
const findSumCombinations = (
  candidates: SplitCandidate[],
  targetCents: number,
  maxSize: number,
): SplitCandidate[][] => {
  const results: SplitCandidate[][] = [];
  if (candidates.length > MAX_CANDIDATES_FOR_SUM_SEARCH) return results;

  const search = (start: number, chosen: SplitCandidate[], sumCents: number): void => {
    if (results.length > 1) return;
    if (chosen.length > 0 && Math.abs(sumCents - targetCents) <= AMOUNT_TOLERANCE_CENTS) {
      results.push([...chosen]);
      return;
    }
    if (chosen.length >= maxSize || sumCents > targetCents + AMOUNT_TOLERANCE_CENTS) return;
    for (let i = start; i < candidates.length; i++) {
      search(i + 1, [...chosen, candidates[i]], sumCents + toCents(candidates[i].remainingAmount));
      if (results.length > 1) return;
    }
  };
  search(0, [], 0);
  return results;
};

export const findSettlementMatches = (
  venmoTxns: VenmoTransactionCandidate[],
  splits: SplitCandidate[],
  windowDays: number = DEFAULT_WINDOW_DAYS,
): SettlementMatch[] => {
  const usedSplitIds = new Set<string>();
  const matches: SettlementMatch[] = [];

  for (const txn of venmoTxns) {
    if (txn.typeManuallySet) continue;
    if (txn.amount >= 0) continue; // only money coming in can settle a split

    const targetCents = toCents(txn.amount);
    const candidates = splits.filter(
      (s) => !usedSplitIds.has(s.id) && daysBetween(txn.date, s.date) <= windowDays,
    );

    // Collecting every exact match (not just the first) so two unrelated splits that happen to
    // owe the same amount are treated as ambiguous instead of silently picking whichever is
    // first in the array.
    const exactMatches = candidates.filter((s) => Math.abs(toCents(s.remainingAmount) - targetCents) <= AMOUNT_TOLERANCE_CENTS);
    if (exactMatches.length === 1) {
      const [exact] = exactMatches;
      matches.push({ venmoTransactionId: txn.id, splitIds: [exact.id], splitAmounts: { [exact.id]: exact.remainingAmount } });
      usedSplitIds.add(exact.id);
      continue;
    }
    if (exactMatches.length > 1) continue; // ambiguous: two splits owe the same amount, don't guess

    const combinations = findSumCombinations(candidates, targetCents, MAX_SPLITS_PER_MATCH);
    if (combinations.length === 1) {
      const picked = combinations[0];
      matches.push({
        venmoTransactionId: txn.id,
        splitIds: picked.map((s) => s.id),
        splitAmounts: Object.fromEntries(picked.map((s) => [s.id, s.remainingAmount])),
      });
      for (const s of picked) usedSplitIds.add(s.id);
    }
    // 0 combinations (no match) or >1 (ambiguous): leave unmatched for manual linking.
  }

  return matches;
};
