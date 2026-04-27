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
