// Pure helper (no DB deps) so it can be unit-tested in isolation.

export interface SplitInput {
  amount: number;
  description: string;
  is_my_share: boolean;
}

// Scale a pending transaction's splits to the posted total so each split keeps
// its share of the (possibly tip-adjusted) amount, correcting rounding drift so
// the splits sum back exactly to the posted total.
export function scaleSplits(splits: SplitInput[], newTotal: number): SplitInput[] {
  if (!splits.length) return [];
  const round = (n: number) => Math.round(n * 100) / 100;
  const target = round(Math.abs(newTotal));
  const oldTotal = splits.reduce((sum, s) => sum + Math.abs(s.amount), 0);
  const scale = oldTotal > 0 ? target / oldTotal : 1;

  const scaled = splits.map(s => ({
    amount: round(Math.abs(s.amount) * scale),
    description: s.description,
    is_my_share: s.is_my_share,
  }));

  const sum = round(scaled.reduce((acc, s) => acc + s.amount, 0));
  const drift = round(target - sum);
  if (drift !== 0) {
    let largest = 0;
    for (let i = 1; i < scaled.length; i++) if (scaled[i].amount > scaled[largest].amount) largest = i;
    scaled[largest].amount = round(scaled[largest].amount + drift);
  }
  return scaled;
}
