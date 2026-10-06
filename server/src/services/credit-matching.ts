// Pairs detected recurring card credits with the recurring charges they
// offset (e.g. "Platinum Walmart+ Credit" reliably posts against the
// Walmart+ subscription), so the UI can show net effective cost.

import { monthlyEquivalentAmount } from './recurring-normalize.js';
import type { DetectedSeries } from './recurring-detection.js';

export interface MatchedCredit {
  merchant: string; // the credit series merchant name
  monthlyAmount: number; // monthly-equivalent credit
}

// Words that appear in credit names without identifying the merchant.
const GENERIC_TOKENS = new Set([
  'credit', 'credits', 'platinum', 'gold', 'amex', 'card', 'membership',
  'renewal', 'monthly', 'annual', 'statement', 'the', 'plus', 'one',
]);

const significantTokens = (name: string): Set<string> => {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !GENERIC_TOKENS.has(t));
  return new Set(tokens);
};

const overlap = (a: Set<string>, b: Set<string>): number => {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
};

// A matched credit should roughly offset the charge, not dwarf it.
const AMOUNT_CAP_RATIO = 1.5;

export interface PostingTxn {
  merchant: string;
  amount: number; // absolute
  date: string; // YYYY-MM-DD
  transaction_type: string | null;
  accountName: string | null;
}

// Card perks often post as one generic credit per charge ("Platinum Digital
// Entertainment Credit" for Peacock and the NYT) on irregular days, under a
// name that shares no word with the merchant. Name matching and series
// detection both miss those, so pair individual postings instead: a charge is
// covered when, for most of its recent charges, a credit of the same amount
// landed on the same account shortly after.
const RECENT_CHARGES = 3;
const MIN_PAIRED_CHARGES = 2;
const CREDIT_WINDOW_BEFORE_DAYS = 1; // posting dates can lead by a day
const CREDIT_WINDOW_AFTER_DAYS = 10;
const PAIR_AMOUNT_TOLERANCE_ABS = 0.5;
const PAIR_AMOUNT_TOLERANCE_RATIO = 0.05;
const PERK_CREDIT_PATTERN = /credit/i;
const NOT_PERK_PATTERN = /dispute/i;

const EXACT_AMOUNT_EPSILON = 0.005;

const isBetterRank = (a: readonly number[], b: readonly number[]): boolean => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
};

const dayDiff = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

const medianOf = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// usedCredits is shared across calls so a later pass (e.g. deleted charges)
// cannot claim postings an earlier pass already consumed.
export function matchCreditsByPosting(
  charges: DetectedSeries[],
  txns: PostingTxn[],
  usedCredits: Set<PostingTxn> = new Set()
): Map<string, MatchedCredit> {
  const matches = new Map<string, MatchedCredit>();
  const credits = txns.filter(t => t.transaction_type === 'return' && t.accountName);
  // Newest posting in the data approximates "today" for pending credits.
  const latestDate = txns.reduce((max, t) => (t.date > max ? t.date : max), '');

  // Larger series first so a big charge claims its credit before a smaller
  // one with a coincidentally similar amount.
  const monthly = charges
    .filter(c => c.frequency === 'monthly')
    .sort((a, b) => b.averageAmount - a.averageAmount);

  for (const series of monthly) {
    const seriesTokens = significantTokens(series.merchant);
    const recent = txns
      .filter(t => t.transaction_type === 'expense' && t.merchant === series.merchant && t.accountName)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, RECENT_CHARGES);
    if (recent.length < MIN_PAIRED_CHARGES) continue;

    const eligible = credits.filter(
      c =>
        !usedCredits.has(c) &&
        ((PERK_CREDIT_PATTERN.test(c.merchant) && !NOT_PERK_PATTERN.test(c.merchant)) ||
          overlap(seriesTokens, significantTokens(c.merchant)) > 0),
    );

    const pairs: PostingTxn[] = [];
    let pending = 0; // unpaired charges whose credit window is still open
    const claimed = new Set<PostingTxn>();
    for (const chargeTxn of recent) {
      const tolerance = Math.max(PAIR_AMOUNT_TOLERANCE_ABS, chargeTxn.amount * PAIR_AMOUNT_TOLERANCE_RATIO);
      let best: PostingTxn | null = null;
      let bestRank: [number, number, number] | null = null;
      for (const c of eligible) {
        if (claimed.has(c) || c.accountName !== chargeTxn.accountName) continue;
        const days = dayDiff(chargeTxn.date, c.date);
        if (days < -CREDIT_WINDOW_BEFORE_DAYS || days > CREDIT_WINDOW_AFTER_DAYS) continue;
        const amountDiff = Math.abs(c.amount - chargeTxn.amount);
        if (amountDiff > tolerance) continue;
        // An exact amount (to the cent) beats any near miss regardless of
        // date; within a bucket the closest date wins, then the closest amount.
        const rank: [number, number, number] = [
          amountDiff <= EXACT_AMOUNT_EPSILON ? 0 : 1,
          Math.abs(days),
          amountDiff,
        ];
        if (!bestRank || isBetterRank(rank, bestRank)) {
          bestRank = rank;
          best = c;
        }
      }
      if (best) {
        claimed.add(best);
        pairs.push(best);
      } else if (dayDiff(chargeTxn.date, latestDate) <= CREDIT_WINDOW_AFTER_DAYS) {
        pending++;
      }
    }

    if (pairs.length < MIN_PAIRED_CHARGES) continue;
    pairs.forEach(p => usedCredits.add(p));

    // Label with the most common credit name among the pairs.
    const labelCounts = new Map<string, number>();
    for (const p of pairs) labelCounts.set(p.merchant, (labelCounts.get(p.merchant) || 0) + 1);
    const [label] = [...labelCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    // A perk that covered only some of the recent charges offsets only that
    // share of the monthly cost, not the full amount.
    // Charges too recent for their credit to have posted yet do not count
    // against it.
    const coverage = pairs.length / (recent.length - pending);
    const monthlyAmount = Math.min(medianOf(pairs.map(p => p.amount)), series.averageAmount) * coverage;
    matches.set(series.merchant, { merchant: label, monthlyAmount: Math.round(monthlyAmount * 100) / 100 });
  }

  return matches;
}

export function matchCreditsToCharges(
  charges: DetectedSeries[],
  credits: DetectedSeries[]
): Map<string, MatchedCredit> {
  const matches = new Map<string, MatchedCredit>();
  const usedCredits = new Set<string>();

  // Score all viable (charge, credit) pairs, then assign greedily by score.
  const candidates: Array<{ charge: DetectedSeries; credit: DetectedSeries; score: number }> = [];
  for (const charge of charges) {
    const chargeTokens = significantTokens(charge.merchant);
    if (chargeTokens.size === 0) continue;
    for (const credit of credits) {
      if (credit.frequency !== charge.frequency) continue;
      if (credit.averageAmount > charge.averageAmount * AMOUNT_CAP_RATIO) continue;
      const shared = overlap(chargeTokens, significantTokens(credit.merchant));
      if (shared === 0) continue;
      // Prefer stronger token overlap, then closer amounts.
      const amountCloseness = 1 - Math.min(1, Math.abs(credit.averageAmount - charge.averageAmount) / Math.max(charge.averageAmount, 0.01));
      candidates.push({ charge, credit, score: shared + amountCloseness });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const { charge, credit } of candidates) {
    if (matches.has(charge.merchant) || usedCredits.has(credit.merchant)) continue;
    matches.set(charge.merchant, {
      merchant: credit.merchant,
      monthlyAmount: Math.round(monthlyEquivalentAmount(credit.frequency, credit.averageAmount) * 100) / 100,
    });
    usedCredits.add(credit.merchant);
  }

  return matches;
}

// Posting level pairs first: they use real amounts, dates and accounts, so
// they catch generic perk credits that name matching cannot. Credit series
// already claimed that way are not offered to the name matcher again.
const matchAllCredits = (
  charges: DetectedSeries[],
  credits: DetectedSeries[],
  txns: PostingTxn[],
  usedPostings: Set<PostingTxn>
): Map<string, MatchedCredit> => {
  const postingOffsets = matchCreditsByPosting(charges, txns, usedPostings);
  const claimed = new Set([...postingOffsets.values()].map(m => m.merchant));
  const nameOffsets = matchCreditsToCharges(
    charges.filter(c => !postingOffsets.has(c.merchant)),
    credits.filter(c => !claimed.has(c.merchant))
  );
  return new Map([...postingOffsets, ...nameOffsets]);
};

const creditNames = (offsets: Map<string, MatchedCredit>): string[] =>
  [...offsets.values()].map(m => m.merchant);

export interface ResolvedCreditOffsets {
  /** Offsets for visible charges only. */
  offsets: Map<string, MatchedCredit>;
  /**
   * Credit names claimed by any charge, including ones the user deleted. A
   * deleted charge's credit is not a free standing credit, so it must not be
   * counted as one against the remaining subscriptions.
   */
  matchedCreditNames: Set<string>;
}

// Deleted charges are matched after the visible ones, against the credits the
// visible ones left over, so a deleted series (e.g. a grocery "Walmart"
// series) can never take a credit away from a live subscription.
export function resolveCreditOffsets(input: {
  charges: DetectedSeries[];
  deletedCharges: DetectedSeries[];
  credits: DetectedSeries[];
  txns: PostingTxn[];
}): ResolvedCreditOffsets {
  const { charges, deletedCharges, credits, txns } = input;
  // Postings consumed by visible charges stay unavailable to deleted ones.
  const usedPostings = new Set<PostingTxn>();
  const offsets = matchAllCredits(charges, credits, txns, usedPostings);
  const claimed = new Set(creditNames(offsets));
  const deletedOffsets = matchAllCredits(
    deletedCharges,
    credits.filter(c => !claimed.has(c.merchant)),
    txns,
    usedPostings
  );
  return {
    offsets,
    matchedCreditNames: new Set([...claimed, ...creditNames(deletedOffsets)]),
  };
}
