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
  InvestmentHoldingsResponse,
  InvestmentSummary,
  InsightsData,
  SavingsGoal,
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

  // Handle empty responses (e.g., 201 Created with no body, 204 No Content)
  const contentType = response.headers.get('content-type');
  const contentLength = response.headers.get('content-length');

  if (
    response.status === 204 ||
    contentLength === '0' ||
    (contentType && !contentType.includes('application/json'))
  ) {
    return undefined as T;
  }

  // Check if there's actually content to parse
  const text = await response.text();
  if (!text || text.trim() === '') {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (e) {
    // If parsing fails, return undefined for void responses
    return undefined as T;
  }
};

// Types for CSV import
export interface CsvPreviewTransaction {
  date: string;
  description: string;
  amount: number;
  extendedDetails?: string;
  transactionType: 'income' | 'expense' | 'transfer' | 'investment' | 'return';
  categoryName: string | null;
  needsReview: boolean;
  hash: string;
  isDuplicate: boolean;
}

export interface CsvPreviewResponse {
  success: boolean;
  format: string;
  totalRows: number;
  transactions: CsvPreviewTransaction[];
  duplicateCount: number;
  newCount: number;
}

export interface CsvImportResponse {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  importId?: string;
}

export interface CsvImportRecord {
  id: string;
  account_id: string;
  file_name: string;
  transaction_count: number;
  created_at: string;
}

export interface CreateManualAccountData {
  institution_name: string;
  account_name: string;
  account_type: string;
  current_balance?: number;
}

// Accounts
export const getAccounts = () => fetchApi<Account[]>('/accounts');

export const createManualAccount = (data: CreateManualAccountData) =>
  fetchApi<Account>('/accounts/manual', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const createPlaidLinkToken = (redirectUri?: string) =>
  fetchApi<PlaidLinkToken>('/plaid/create-link-token', {
    method: 'POST',
    body: JSON.stringify({ redirect_uri: redirectUri }),
  });

export const createPlaidUpdateLinkToken = (accountId: string, redirectUri?: string) =>
  fetchApi<PlaidLinkToken>('/plaid/create-update-link-token', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId, redirect_uri: redirectUri }),
  });

export const exchangePlaidToken = (publicToken: string, metadata: unknown) =>
  fetchApi<Account>('/plaid/exchange-token', {
    method: 'POST',
    body: JSON.stringify({ public_token: publicToken, metadata }),
  });

type PlaidLinkEventPayload = {
  event_name: string;
  error?: unknown;
  metadata?: unknown;
  link_session_id?: string | null;
  url?: string;
  user_agent?: string;
};

export const logPlaidLinkEvent = (payload: PlaidLinkEventPayload) =>
  fetchApi<void>('/plaid/log-link-event', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const syncAccount = (accountId: string) =>
  fetchApi<{ synced: number }>(`/accounts/${accountId}/sync`, { method: 'POST' });

export const deleteAccount = (accountId: string) =>
  fetchApi<void>(`/accounts/${accountId}`, { method: 'DELETE' });

export interface UpdateAccountData {
  // Add other update fields as needed
}

export const updateAccount = (accountId: string, data: UpdateAccountData) =>
  fetchApi<Account>(`/accounts/${accountId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export interface BalanceResponse {
  balance: number;
  account_name: string;
}

export const refreshBalance = (accountId: string) =>
  fetchApi<BalanceResponse>(`/accounts/${accountId}/balance`);

export interface RefreshAccountsResponse {
  message: string;
  created: Array<{ id: string; name: string; type: string }>;
  updated: string[];
  total_new: number;
  total_updated: number;
}

export const refreshAccounts = (accountId: string) =>
  fetchApi<RefreshAccountsResponse>(`/accounts/${accountId}/refresh-accounts`, { method: 'POST' });

export const reclassifyTransactions = () =>
  fetchApi<{ reclassified: number; breakdown: { income: number; expense: number; transfer: number } }>(
    '/accounts/reclassify-transactions',
    { method: 'POST' }
  );

export const recategorizeAllTransactions = (options?: { skipManual?: boolean; force?: boolean }) =>
  fetchApi<{
    recategorized: number;
    skipped: number;
    markedForReview: number;
    categoryBreakdown: Record<string, number>;
  }>(
    '/accounts/recategorize-all',
    {
      method: 'POST',
      body: JSON.stringify({
        skip_manual: options?.skipManual ?? true,
        force: options?.force ?? false
      }),
    }
  );

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

export const getSimilarTransactionsCount = (merchantName: string, excludeId?: string) => {
  const params = new URLSearchParams();
  if (excludeId) {
    params.append('excludeId', excludeId);
  }
  const queryString = params.toString();
  return fetchApi<{ count: number }>(
    `/transactions/similar/${encodeURIComponent(merchantName)}/count${queryString ? `?${queryString}` : ''}`
  );
};

export const getSimilarTransactions = (merchantName: string, excludeId?: string) => {
  const params = new URLSearchParams();
  if (excludeId) {
    params.append('excludeId', excludeId);
  }
  const queryString = params.toString();
  return fetchApi<Transaction[]>(
    `/transactions/similar/${encodeURIComponent(merchantName)}${queryString ? `?${queryString}` : ''}`
  );
};

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

// Duplicate detection
export interface DuplicateTransaction {
  id: string;
  merchant_name: string;
  merchant_display_name: string | null;
  transaction_type: string;
  import_id: string | null;
  created_at: string;
}

export interface DuplicateGroup {
  count: number;
  date: string;
  amount: number;
  merchant: string;
  accountName: string;
  transactions: DuplicateTransaction[];
}

export interface DuplicatesResponse {
  totalGroups: number;
  totalDuplicates: number;
  groups: DuplicateGroup[];
}

export const getDuplicates = () =>
  fetchApi<DuplicatesResponse>('/transactions/duplicates');

export const bulkDeleteTransactions = (transactionIds: string[]) =>
  fetchApi<{ deleted: number }>('/transactions/bulk/delete', {
    method: 'POST',
    body: JSON.stringify({ transactionIds }),
  });

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

export const bulkAddTagToTransactions = (transactionIds: string[], tagId: string) =>
  fetchApi<{ added: number; skipped: number }>('/transactions/bulk/tags', {
    method: 'POST',
    body: JSON.stringify({ transactionIds, tagId }),
  });

export const bulkRemoveTagFromTransactions = (transactionIds: string[], tagId: string) =>
  fetchApi<void>('/transactions/bulk/tags', {
    method: 'DELETE',
    body: JSON.stringify({ transactionIds, tagId }),
  });

export const bulkSplitTransactions = (transactionIds: string[], numPeople: number) =>
  fetchApi<{ split: number; skipped: number }>('/transactions/bulk/splits', {
    method: 'POST',
    body: JSON.stringify({ transactionIds, numPeople }),
  });

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

export const getInsights = () =>
  fetchApi<InsightsData>('/stats/insights');

// CSV Import
export const previewCsvImport = async (accountId: string, file: File): Promise<CsvPreviewResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/csv-import/${accountId}/preview`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Preview failed' }));
    throw new Error(error.message || 'Preview failed');
  }

  return response.json();
};

export const importCsv = async (
  accountId: string,
  file: File,
  skipDuplicates = true
): Promise<CsvImportResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('skipDuplicates', String(skipDuplicates));

  const response = await fetch(`${API_BASE_URL}/csv-import/${accountId}/import`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Import failed' }));
    throw new Error(error.message || 'Import failed');
  }

  return response.json();
};

export const getCsvImports = (accountId: string) =>
  fetchApi<CsvImportRecord[]>(`/csv-import/${accountId}/imports`);

export const deleteCsvImport = (importId: string) =>
  fetchApi<void>(`/csv-import/imports/${importId}`, { method: 'DELETE' });

export const backfillCsvReferences = async (
  accountId: string,
  file: File,
): Promise<{ success: boolean; updated: number; skipped: number; total: number }> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/csv-import/${accountId}/backfill-references`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Backfill failed' }));
    throw new Error(error.message || 'Backfill failed');
  }

  return response.json();
};

// App Settings
export const getAppSettings = () =>
  fetchApi<Record<string, string>>('/settings');

export const updateAppSetting = (key: string, value: string) =>
  fetchApi<{ key: string; value: string; updated_at: string }>(`/settings/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });

// Estimated Income
export const getEstimatedIncome = () =>
  fetchApi<{ estimated_monthly_income: number; months_sampled: number }>('/stats/estimated-income');

// Savings Goals
export const getSavingsGoals = () =>
  fetchApi<SavingsGoal[]>('/savings-goals');

export const createSavingsGoal = (data: Omit<SavingsGoal, 'id' | 'created_at' | 'updated_at'>) =>
  fetchApi<SavingsGoal>('/savings-goals', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateSavingsGoal = (id: string, data: Partial<SavingsGoal>) =>
  fetchApi<SavingsGoal>(`/savings-goals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteSavingsGoal = (id: string) =>
  fetchApi<void>(`/savings-goals/${id}`, { method: 'DELETE' });

// Investments
export const getInvestmentHoldings = () =>
  fetchApi<InvestmentHoldingsResponse>('/investments/holdings');

export const getInvestmentSummary = () =>
  fetchApi<InvestmentSummary>('/investments/summary');

export const syncInvestmentHoldings = (accountId: string) =>
  fetchApi<{ message: string; synced: number; securities: number }>(
    `/investments/${accountId}/sync`,
    { method: 'POST' }
  );

export const syncAllInvestmentHoldings = () =>
  fetchApi<{ message: string; itemsProcessed: number; totalHoldings: number; totalSecurities: number }>(
    '/investments/sync-all',
    { method: 'POST' }
  );

export interface HoldingsPreviewItem {
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  value: number;
  costBasis: number;
}

export interface HoldingsPreviewResponse {
  holdings: HoldingsPreviewItem[];
  count: number;
  totalValue: number;
  totalCostBasis: number;
}

export interface HoldingsImportResponse {
  imported: number;
  totalValue: number;
}

export const previewHoldingsImport = async (accountId: string, file: File): Promise<HoldingsPreviewResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/investments/${accountId}/preview-holdings`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Preview failed' }));
    throw new Error(error.message || 'Preview failed');
  }

  return response.json();
};

export const importHoldings = async (accountId: string, file: File): Promise<HoldingsImportResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/investments/${accountId}/import-holdings`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Import failed' }));
    throw new Error(error.message || 'Import failed');
  }

  return response.json();
};

export const toggleAccountInvestmentExclusion = (
  accountId: string,
  excludeFromInvestments: boolean,
  exclusionNote?: string
) =>
  fetchApi<Account>(`/investments/accounts/${accountId}/exclude`, {
    method: 'PATCH',
    body: JSON.stringify({
      exclude_from_investments: excludeFromInvestments,
      investment_exclusion_note: exclusionNote
    }),
  });
