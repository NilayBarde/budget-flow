// Pure helpers (no DB deps) shared by stats and budget-goals routes so
// per-category spending is computed identically everywhere.

export interface SplitShare {
  amount: number;
  is_my_share: boolean;
}

export interface SpendRow {
  category_id: string | null;
  amount: number;
  transaction_type: string | null;
  is_split: boolean;
  splits?: SplitShare[] | null;
}

// The universal "my share" rule: for a split transaction, only splits
// flagged is_my_share count toward my spending; otherwise the full amount.
export function getMyShareAmount(t: {
  amount: number;
  is_split: boolean;
  splits?: SplitShare[] | null;
}): number {
  const splits = t.splits ?? null;
  if (t.is_split && splits && splits.length > 0) {
    return splits
      .filter(s => s.is_my_share)
      .reduce((sum, s) => sum + Math.abs(s.amount), 0);
  }
  return Math.abs(t.amount);
}

// Two-pass netting: accumulate all expenses first, then subtract returns,
// clamped at zero. A single pass would swallow a return that appears
// before its matching expense in the result set.
export function computeCategorySpend(rows: SpendRow[]): Map<string, number> {
  const spent = new Map<string, number>();
  const returns: Array<{ categoryId: string; amount: number }> = [];

  for (const rowItem of rows) {
    if (!rowItem.category_id) continue;
    const type = rowItem.transaction_type || (rowItem.amount > 0 ? 'expense' : 'income');
    if (type === 'expense') {
      const current = spent.get(rowItem.category_id) || 0;
      spent.set(rowItem.category_id, current + getMyShareAmount(rowItem));
    } else if (type === 'return') {
      returns.push({ categoryId: rowItem.category_id, amount: getMyShareAmount(rowItem) });
    }
  }

  for (const ret of returns) {
    const current = spent.get(ret.categoryId);
    if (current !== undefined) {
      spent.set(ret.categoryId, Math.max(0, current - ret.amount));
    }
  }

  return spent;
}
