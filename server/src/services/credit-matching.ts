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
