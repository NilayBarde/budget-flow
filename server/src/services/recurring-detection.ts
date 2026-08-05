// Pure recurring-series detection over transaction history. Groups
// transactions by merchant and identifies stable weekly/monthly/yearly
// cadences from the gaps between charges, so the recurring inventory can be
// rebuilt from actual data instead of relying on manual marking.

import type { RecurringFrequency } from './recurring-normalize.js';

export interface DetectionTxn {
  merchant: string;
  amount: number; // my-share, absolute
  date: string; // YYYY-MM-DD
  transaction_type: string | null;
}

export interface DetectedSeries {
  merchant: string;
  frequency: RecurringFrequency;
  averageAmount: number; // median charge, per cadence period
  lastSeen: string; // YYYY-MM-DD of the most recent charge
  isActive: boolean;
}

interface CadenceRule {
  frequency: RecurringFrequency;
  minGap: number;
  maxGap: number;
  minCharges: number;
  // A series is still active if the last charge is within this many days.
  activeWithinDays: number;
  // Extra tolerance when counting conforming gaps (median must still land
  // inside [minGap, maxGap]); utilities bill anywhere from 17 to 63 days apart.
  slackDays: number;
}

// Order matters: prefer the tightest cadence that fits.
const CADENCES: CadenceRule[] = [
  { frequency: 'weekly', minGap: 5, maxGap: 9, minCharges: 6, activeWithinDays: 16, slackDays: 2 },
  { frequency: 'monthly', minGap: 24, maxGap: 38, minCharges: 3, activeWithinDays: 55, slackDays: 7 },
  { frequency: 'yearly', minGap: 330, maxGap: 400, minCharges: 2, activeWithinDays: 430, slackDays: 35 },
];

// At least this share of gaps must fall inside the cadence window (or its
// doubled "skipped one period" window). Real-world billing drifts: utility
// bills land anywhere from 17 to 41 days apart, so this is deliberately
// loose; the median-gap check is the primary filter.
const GAP_CONFORMANCE = 0.6;

const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

const median = (values: number[]): number => {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function detectRecurringSeries(
  transactions: DetectionTxn[],
  today: string,
  type: string = 'expense'
): DetectedSeries[] {
  const byMerchant = new Map<string, DetectionTxn[]>();
  for (const t of transactions) {
    if (t.transaction_type !== type) continue;
    if (!t.merchant || t.amount <= 0) continue;
    const list = byMerchant.get(t.merchant) || [];
    list.push(t);
    byMerchant.set(t.merchant, list);
  }

  const detected: DetectedSeries[] = [];

  for (const [merchant, txns] of byMerchant) {
    txns.sort((a, b) => a.date.localeCompare(b.date));

    // Collapse same-day charges (e.g. a charge plus a fee) into one event
    // per day for cadence purposes; amounts sum per day.
    const byDay = new Map<string, number>();
    for (const t of txns) {
      byDay.set(t.date, (byDay.get(t.date) || 0) + t.amount);
    }
    const days = [...byDay.keys()].sort();
    if (days.length < 2) continue;

    const gaps: number[] = [];
    for (let i = 1; i < days.length; i++) {
      gaps.push(daysBetween(days[i - 1], days[i]));
    }
    const medianGap = median(gaps);

    for (const rule of CADENCES) {
      if (days.length < rule.minCharges) continue;
      if (medianGap < rule.minGap || medianGap > rule.maxGap) continue;

      const lo = rule.minGap - rule.slackDays;
      const hi = rule.maxGap + rule.slackDays;
      const conforming = gaps.filter(
        g =>
          (g >= lo && g <= hi) ||
          // A single skipped period reads as a doubled gap
          (g >= lo * 2 && g <= hi * 2)
      ).length;
      if (conforming / gaps.length < GAP_CONFORMANCE) continue;

      const amounts = days.map(d => byDay.get(d) as number);

      // Weekly cadence alone can't distinguish a subscription from a shopping
      // habit (groceries, coffee); require stable amounts for weekly series.
      // Monthly/yearly stay loose because utility bills genuinely vary.
      if (rule.frequency === 'weekly') {
        const med = median(amounts);
        const stable = amounts.filter(a => Math.abs(a - med) <= med * 0.25).length;
        if (stable / amounts.length < 0.7) continue;
      }

      const lastSeen = days[days.length - 1];
      detected.push({
        merchant,
        frequency: rule.frequency,
        averageAmount: Math.round(median(amounts) * 100) / 100,
        lastSeen,
        isActive: daysBetween(lastSeen, today) <= rule.activeWithinDays,
      });
      break;
    }
  }

  return detected.sort((a, b) => b.averageAmount - a.averageAmount);
}
