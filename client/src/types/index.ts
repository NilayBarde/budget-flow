export type TransactionType = 'income' | 'expense' | 'transfer' | 'investment' | 'return';

export interface Account {
  id: string;
  user_id: string;
  plaid_item_id: string;
  plaid_account_id?: string | null;
  institution_name: string;
  account_name: string;
  account_type: string;
  historical_sync_complete?: boolean;
  current_balance?: number | null;
  exclude_from_investments?: boolean;
  investment_exclusion_note?: string | null;
  last_csv_import_at?: string | null;
  needs_reauth?: boolean;
  reauth_detected_at?: string | null;
  last_synced_at?: string | null;
  last_sync_error?: string | null;
  last_sync_error_at?: string | null;
  created_at: string;
}

export interface SyncHealthAccount {
  id: string;
  institution_name: string;
  account_name: string;
  account_type: string;
  needs_reauth: boolean;
  reauth_detected_at: string | null;
  last_synced_at: string | null;
  last_sync_error?: string | null;
  last_sync_error_at?: string | null;
}

export interface SyncHealth {
  healthy: boolean;
  staleDays: number;
  investmentStaleDays: number;
  needs_reauth: SyncHealthAccount[];
  /** Accounts whose last sync failed for a reason other than needing a reconnect. */
  failing?: SyncHealthAccount[];
  stale: SyncHealthAccount[];
}

export interface PlaidPFC {
  primary?: string;
  detailed?: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  plaid_transaction_id: string | null;
  amount: number;
  date: string;
  merchant_name: string;
  original_description: string | null;  // Full description from bank/Plaid
  merchant_display_name: string | null;
  category_id: string | null;
  transaction_type: TransactionType;
  is_split: boolean;
  /** The user said this should stay whole, so it no longer shows under "Possible missed splits". */
  split_dismissed?: boolean;
  parent_transaction_id: string | null;
  is_recurring: boolean;
  needs_review: boolean;  // Flag for transactions that need manual categorization
  pending: boolean;  // Transaction is pending (not yet posted)
  plaid_category: PlaidPFC | null;  // Plaid's personal_finance_category
  notes: string | null;
  created_at: string;
  // Joined fields
  account?: Account;
  category?: Category;
  tags?: Tag[];
  splits?: TransactionSplit[];
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
}

export interface BudgetGoal {
  id: string;
  category_id: string;
  month: number;
  year: number;
  limit_amount: number;
  created_at: string;
  // Joined fields
  category?: Category;
  spent?: number;
}

export interface TransactionSplit {
  id: string;
  parent_transaction_id: string;
  amount: number;
  description: string;
  is_my_share: boolean;  // Only splits marked as my_share count toward totals
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface TransactionTag {
  transaction_id: string;
  tag_id: string;
}

export interface RecurringTransaction {
  id: string;
  merchant_display_name: string;
  average_amount: number;
  frequency: 'weekly' | 'monthly' | 'yearly';
  last_seen: string;
  is_active: boolean;
  source?: 'manual' | 'detected';
  user_hidden?: boolean;
  offset_merchant_name?: string | null;
  offset_monthly_amount?: number | null;
  created_at: string;
}

// Subscription overview (net-of-credits view)
export interface RecurringOverviewCharge {
  id: string;
  merchant: string;
  frequency: 'weekly' | 'monthly' | 'yearly';
  average_amount: number;
  monthly_amount: number;
  source: 'manual' | 'detected';
  last_seen: string;
  offset_merchant_name: string | null;
  offset_monthly_amount: number | null;
  net_monthly: number;
}

export interface RecurringOverviewCredit {
  merchant: string;
  frequency: 'weekly' | 'monthly' | 'yearly';
  monthly_amount: number;
}

export interface RecurringOverviewCard {
  account_name: string;
  fee_annual: number;
  credits_12mo: number;
  net_annual: number;
  covered: boolean;
}

export interface RecurringOverview {
  charges: RecurringOverviewCharge[];
  credits: RecurringOverviewCredit[];
  cards: RecurringOverviewCard[];
  summary: {
    gross_monthly: number;
    credits_monthly: number;
    net_monthly: number;
  };
}

export interface MonthlyStats {
  month: number;
  year: number;
  total_spent: number;
  total_income: number;
  total_invested: number;
  pending_spent: number;
  by_category: { category: Category; amount: number }[];
}

export interface YearlyStats {
  year: number;
  monthly_totals: { month: number; spent: number; income: number; invested: number }[];
  category_totals: { category: Category; amount: number }[];
  total_spent: number;
  total_income: number;
  total_invested: number;
}

// Insights types
export interface InsightsCategoryTrend {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  months: { month: number; year: number; amount: number }[];
}

export interface InsightsTopMerchant {
  merchantName: string;
  totalSpent: number;
  transactionCount: number;
  avgTransaction: number;
  lastDate: string;
}

export interface InsightsSpendingVelocity {
  daysElapsed: number;
  daysInMonth: number;
  spentSoFar: number;
  projectedTotal: number;
  lastMonthTotal: number;
  dailyAverage: number;
  expectedFixedCosts: number;
  recurringSpent: number;
  variableSpent: number;
  /** Fixed costs still due this month. */
  remainingFixed: number;
  /** Variable spending so far plus the remaining days at the daily rate. */
  projectedVariable: number;
  excludedOutlierAmount: number;
}

export interface InsightsMonthOverMonth {
  currentMonth: { month: number; year: number; spent: number; income: number; net: number };
  previousMonth: { month: number; year: number; spent: number; income: number; net: number };
  spentChangePercent: number;
  incomeChangePercent: number;
}

export interface InsightsTopCategory {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  totalSpent: number;
  transactionCount: number;
}

export interface InsightsData {
  categoryTrends: InsightsCategoryTrend[];
  topCategories: InsightsTopCategory[];
  topMerchants: InsightsTopMerchant[];
  spendingVelocity: InsightsSpendingVelocity;
  monthOverMonth: InsightsMonthOverMonth;
}

export interface PlaidLinkToken {
  link_token: string;
  expiration: string;
}

export type TransactionFilters = {
  month?: number;
  year?: number;
  account_id?: string;
  category_id?: string;
  tag_id?: string;
  search?: string;
  is_recurring?: boolean;
  transaction_type?: TransactionType;
  needs_review?: boolean;
  date?: string; // exact date filter, YYYY-MM-DD
};

// Investment types
export interface AccountSummary {
  id: string;
  name: string;
  type: string;
  balance: number | null;
  isInvestment: boolean;
  isLiability: boolean;
  excluded: boolean;
}

export interface InvestmentSummary {
  investments: {
    totalValue: number;
    accountCount: number;
  };
  cash: {
    totalAssets: number;
    totalLiabilities: number;
    netBalance: number;
    assetAccountCount: number;
    liabilityAccountCount: number;
  };
  netWorth: number;
  accounts: AccountSummary[];
}
