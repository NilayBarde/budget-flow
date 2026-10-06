export interface MerchantAggregate {
  merchantName: string;
  totalSpent: number;
  transactionCount: number;
  lastDate: string;
}

export interface TopMerchant extends MerchantAggregate {
  avgTransaction: number;
}

const TOP_MERCHANT_LIMIT = 10;

interface MerchantNames {
  merchant_name?: string | null;
  merchant_display_name?: string | null;
}

/** The name a merchant is grouped under: the user's display name wins over the Plaid name. */
export const merchantKey = (t: MerchantNames): string | null =>
  t.merchant_display_name || t.merchant_name || null;

/** Count one expense toward its merchant's total. */
export const addMerchantSpend = (
  merchantMap: Map<string, MerchantAggregate>,
  merchant: string,
  amount: number,
  date: string,
): void => {
  const existing = merchantMap.get(merchant);
  if (existing) {
    existing.totalSpent += amount;
    existing.transactionCount += 1;
    if (date > existing.lastDate) existing.lastDate = date;
  } else {
    merchantMap.set(merchant, {
      merchantName: merchant,
      totalSpent: amount,
      transactionCount: 1,
      lastDate: date,
    });
  }
};

/** Net a return off its merchant's total, never below zero. A merchant with no expense is left alone. */
export const subtractMerchantReturn = (
  merchantMap: Map<string, MerchantAggregate>,
  merchant: string,
  amount: number,
): void => {
  const existing = merchantMap.get(merchant);
  if (existing) existing.totalSpent = Math.max(0, existing.totalSpent - amount);
};

export const buildTopMerchants = (
  merchantMap: Map<string, MerchantAggregate>,
): TopMerchant[] => {
  return Array.from(merchantMap.values())
    .filter(m => m.totalSpent > 0) // exclude fully-returned merchants
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, TOP_MERCHANT_LIMIT)
    .map(m => ({
      ...m,
      avgTransaction: m.transactionCount > 0 ? m.totalSpent / m.transactionCount : 0,
    }));
};
