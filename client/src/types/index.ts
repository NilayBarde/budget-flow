export type TransactionType = 'income' | 'expense' | 'transfer' | 'investment' | 'return';

export interface Account {
  id: string;
  user_id: string;
  plaid_item_id: string;
  plaid_access_token: string;
  plaid_account_id?: string | null;
  institution_name: string;
  account_name: string;
  account_type: string;
  plaid_cursor?: string | null;
  historical_sync_complete?: boolean;
  current_balance?: number | null;
  balance_threshold?: number | null;
  last_balance_alert_at?: string | null;
  exclude_from_investments?: boolean;
  investment_exclusion_note?: string | null;
  last_csv_import_at?: string | null;
  created_at: string;
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

export interface MerchantMapping {
  id: string;
  original_name: string;
  display_name: string;
  default_category_id: string | null;
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
  created_at: string;
}

export interface MonthlyStats {
  month: number;
  year: number;
  total_spent: number;
  total_income: number;
  total_invested: number;
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
  fixedCosts: number;
  recurringSpent: number;
  variableSpent: number;
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
  dailySpending: { day: number; amount: number }[];
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

// Savings Goals
export interface SavingsGoal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  monthly_contribution: number;
  icon: string;
  color: string;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

// Investment types
export interface Security {
  id: string;
  plaid_security_id: string;
  ticker_symbol: string | null;
  name: string;
  type: string;
  close_price: number | null;
  close_price_as_of: string | null;
  iso_currency_code: string;
  created_at: string;
  updated_at: string;
}

export interface Holding {
  id: string;
  account_id: string;
  security_id: string;
  quantity: number;
  cost_basis: number | null;
  institution_value: number | null;
  iso_currency_code: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  security?: Security;
  account?: {
    id: string;
    institution_name: string;
    account_name: string;
    account_type: string;
    exclude_from_investments?: boolean;
  };
}

export interface HoldingsByAccount {
  account: {
    id: string;
    institution_name: string;
    account_name: string;
    account_type: string;
  };
  holdings: Holding[];
  totalValue: number;
  totalCostBasis: number;
}

export interface InvestmentHoldingsResponse {
  holdings: Holding[];
  byAccount: Record<string, HoldingsByAccount>;
}

export interface AccountSummary {
  id: string;
  name: string;
  type: string;
  balance: number | null;
  isInvestment: boolean;
  isLiability: boolean;
}

export interface InvestmentSummary {
  investments: {
    totalValue: number;
    totalCostBasis: number;
    totalGainLoss: number;
    totalGainLossPercent: number;
    accountCount: number;
    holdingCount: number;
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
