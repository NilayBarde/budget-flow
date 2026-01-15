import { API_BASE_URL } from '../utils/constants';
import type {
  Account,
  Transaction,
  Category,
  BudgetGoal,
  Tag,
  MerchantMapping,
  RecurringTransaction,
  MonthlyStats,
  YearlyStats,
  TransactionFilters,
  PlaidLinkToken,
  TransactionSplit,
} from '../types';

const fetchApi = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || 'Request failed');
  }

  return response.json();
};

// Accounts
export const getAccounts = () => fetchApi<Account[]>('/accounts');

export const createPlaidLinkToken = (redirectUri?: string) => 
  fetchApi<PlaidLinkToken>('/plaid/create-link-token', { 
    method: 'POST',
    body: JSON.stringify({ redirect_uri: redirectUri }),
  });

export const getStoredLinkToken = () =>
  fetchApi<PlaidLinkToken>('/plaid/link-token');

export const exchangePlaidToken = (publicToken: string, metadata: unknown) =>
  fetchApi<Account>('/plaid/exchange-token', {
    method: 'POST',
    body: JSON.stringify({ public_token: publicToken, metadata }),
  });

export const syncAccount = (accountId: string) =>
  fetchApi<{ synced: number }>(`/accounts/${accountId}/sync`, { method: 'POST' });

export const deleteAccount = (accountId: string) =>
  fetchApi<void>(`/accounts/${accountId}`, { method: 'DELETE' });

// Transactions
export const getTransactions = (filters: TransactionFilters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.append(key, String(value));
    }
  });
  return fetchApi<Transaction[]>(`/transactions?${params.toString()}`);
};

export const getTransaction = (id: string) =>
  fetchApi<Transaction>(`/transactions/${id}`);

export const updateTransaction = (id: string, data: Partial<Transaction>, applyToAll = false) =>
  fetchApi<Transaction>(`/transactions/${id}${applyToAll ? '?applyToAll=true' : ''}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const createManualTransaction = (data: Partial<Transaction>) =>
  fetchApi<Transaction>('/transactions', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const deleteTransaction = (id: string) =>
  fetchApi<void>(`/transactions/${id}`, { method: 'DELETE' });

// Transaction Splits
export const createSplit = (transactionId: string, splits: Omit<TransactionSplit, 'id' | 'parent_transaction_id' | 'created_at'>[]) =>
  fetchApi<TransactionSplit[]>(`/transactions/${transactionId}/splits`, {
    method: 'POST',
    body: JSON.stringify({ splits }),
  });

export const deleteSplits = (transactionId: string) =>
  fetchApi<void>(`/transactions/${transactionId}/splits`, { method: 'DELETE' });

// Categories
export const getCategories = () => fetchApi<Category[]>('/categories');

export const createCategory = (data: Omit<Category, 'id' | 'is_default'>) =>
  fetchApi<Category>('/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateCategory = (id: string, data: Partial<Category>) =>
  fetchApi<Category>(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteCategory = (id: string) =>
  fetchApi<void>(`/categories/${id}`, { method: 'DELETE' });

// Budget Goals
export const getBudgetGoals = (month: number, year: number) =>
  fetchApi<BudgetGoal[]>(`/budget-goals?month=${month}&year=${year}`);

export const createBudgetGoal = (data: Omit<BudgetGoal, 'id' | 'created_at' | 'category' | 'spent'>, skipExisting = false) =>
  fetchApi<BudgetGoal>(`/budget-goals${skipExisting ? '?skipExisting=true' : ''}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateBudgetGoal = (id: string, data: Partial<BudgetGoal>) =>
  fetchApi<BudgetGoal>(`/budget-goals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteBudgetGoal = (id: string) =>
  fetchApi<void>(`/budget-goals/${id}`, { method: 'DELETE' });

// Tags
export const getTags = () => fetchApi<Tag[]>('/tags');

export const createTag = (data: Omit<Tag, 'id' | 'created_at'>) =>
  fetchApi<Tag>('/tags', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateTag = (id: string, data: Partial<Tag>) =>
  fetchApi<Tag>(`/tags/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteTag = (id: string) =>
  fetchApi<void>(`/tags/${id}`, { method: 'DELETE' });

export const addTagToTransaction = (transactionId: string, tagId: string) =>
  fetchApi<void>(`/transactions/${transactionId}/tags/${tagId}`, { method: 'POST' });

export const removeTagFromTransaction = (transactionId: string, tagId: string) =>
  fetchApi<void>(`/transactions/${transactionId}/tags/${tagId}`, { method: 'DELETE' });

// Merchant Mappings
export const getMerchantMappings = () => fetchApi<MerchantMapping[]>('/merchant-mappings');

export const createMerchantMapping = (data: Omit<MerchantMapping, 'id' | 'created_at'>) =>
  fetchApi<MerchantMapping>('/merchant-mappings', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const deleteMerchantMapping = (id: string) =>
  fetchApi<void>(`/merchant-mappings/${id}`, { method: 'DELETE' });

// Recurring Transactions
export const getRecurringTransactions = () =>
  fetchApi<RecurringTransaction[]>('/recurring-transactions');

export const detectRecurringTransactions = () =>
  fetchApi<RecurringTransaction[]>('/recurring-transactions/detect', { method: 'POST' });

export const updateRecurringTransaction = (id: string, data: Partial<RecurringTransaction>) =>
  fetchApi<RecurringTransaction>(`/recurring-transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

// Stats
export const getMonthlyStats = (month: number, year: number) =>
  fetchApi<MonthlyStats>(`/stats/monthly?month=${month}&year=${year}`);

export const getYearlyStats = (year: number) =>
  fetchApi<YearlyStats>(`/stats/yearly?year=${year}`);

