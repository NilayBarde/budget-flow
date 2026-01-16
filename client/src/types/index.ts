export type TransactionType = 'income' | 'expense' | 'transfer' | 'investment';

export interface Account {
  id: string;
  user_id: string;
  plaid_item_id: string;
  plaid_access_token: string;
  institution_name: string;
  account_name: string;
  account_type: string;
  created_at: string;
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
};

