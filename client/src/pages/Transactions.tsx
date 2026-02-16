import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckSquare, X, Copy } from 'lucide-react';
import { TransactionList, TransactionFilters, EditTransactionModal, SplitTransactionModal, BulkSplitModal, BulkActionBar, DuplicateReviewModal } from '../components/transactions';
import { Button } from '../components/ui';
import { useTransactions, useAccounts, useCategories, useTags, useBulkAddTagToTransactions, useDeleteTransaction, useBulkDeleteTransactions, useExpectedIncome } from '../hooks';
import type { Transaction, TransactionFilters as Filters, TransactionType } from '../types';
import { getMonthYear } from '../utils/formatters';

type TypeFilter = TransactionType | 'all';

const TYPE_TABS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'expense', label: 'Expenses' },
  { id: 'return', label: 'Returns' },
  { id: 'income', label: 'Income' },
  { id: 'investment', label: 'Investments' },
  { id: 'transfer', label: 'Transfers' },
];

export const Transactions = () => {
  const { month, year } = getMonthYear();
  const [searchParams, setSearchParams] = useSearchParams();

  // Build initial filters from URL search params (e.g. ?date=2026-02-07)
  const [filters, setFilters] = useState<Filters>(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const d = new Date(dateParam + 'T00:00:00');
      return { month: d.getMonth() + 1, year: d.getFullYear(), date: dateParam };
    }

    // Check for explicit month/year params
    const monthParam = searchParams.get('month');
    const yearParam = searchParams.get('year');
    if (monthParam && yearParam) {
      return { month: parseInt(monthParam), year: parseInt(yearParam) };
    }

    return { month, year };
  });
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  // Sync URL search params when date filter changes
  useEffect(() => {
    if (filters.date) {
      setSearchParams({ date: filters.date }, { replace: true });
    } else {
      searchParams.delete('date');
      setSearchParams(searchParams, { replace: true });
    }
  }, [filters.date]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [splittingTransaction, setSplittingTransaction] = useState<Transaction | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addedTagIds, setAddedTagIds] = useState<Set<string>>(new Set());
  const [showBulkSplitModal, setShowBulkSplitModal] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);

  // Build filters with transaction_type
  const queryFilters = useMemo(() => {
    const f: Filters = { ...filters };
    if (typeFilter !== 'all') {
      f.transaction_type = typeFilter;
    }
    return f;
  }, [filters, typeFilter]);

  const { data: transactions, isLoading } = useTransactions(queryFilters);
  // Separate unfiltered query for header totals — ensures totals always reflect the full month
  // regardless of which type tab is active
  const { data: allTransactions } = useTransactions(filters);
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: tags = [] } = useTags();
  const bulkAddTag = useBulkAddTagToTransactions();
  const deleteTransactionMutation = useDeleteTransaction();
  const bulkDeleteMutation = useBulkDeleteTransactions();
  const { expectedIncome } = useExpectedIncome();
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);

  const handleEdit = useCallback((transaction: Transaction) => {
    setEditingTransaction(transaction);
  }, []);

  const handleSplit = useCallback((transaction: Transaction) => {
    setSplittingTransaction(transaction);
  }, []);

  const handleDelete = useCallback((transaction: Transaction) => {
    setDeletingTransaction(transaction);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingTransaction) return;
    await deleteTransactionMutation.mutateAsync(deletingTransaction.id);
    setDeletingTransaction(null);
  }, [deletingTransaction, deleteTransactionMutation]);

  const handleCloseDelete = useCallback(() => {
    setDeletingTransaction(null);
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    await bulkDeleteMutation.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
    setAddedTagIds(new Set());
    setSelectionMode(false);
  }, [selectedIds, bulkDeleteMutation]);

  const handleCloseEdit = useCallback(() => {
    setEditingTransaction(null);
  }, []);

  const handleCloseSplit = useCallback(() => {
    setSplittingTransaction(null);
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) {
        setSelectedIds(new Set());
        setAddedTagIds(new Set());
      }
      return !prev;
    });
  }, []);

  const handleSelectionChange = useCallback((ids: Set<string>) => {
    setSelectedIds(ids);
  }, []);

  const handleBulkAddTag = useCallback(async (tagId: string) => {
    if (selectedIds.size === 0) return;

    await bulkAddTag.mutateAsync({
      transactionIds: Array.from(selectedIds),
      tagId,
    });

    // Track that this tag was added (don't exit selection mode yet)
    setAddedTagIds(prev => new Set([...prev, tagId]));
  }, [selectedIds, bulkAddTag]);

  const handleBulkDone = useCallback(() => {
    setSelectedIds(new Set());
    setAddedTagIds(new Set());
    setSelectionMode(false);
  }, []);

  const handleCancelSelection = useCallback(() => {
    setSelectedIds(new Set());
    setAddedTagIds(new Set());
    setSelectionMode(false);
  }, []);

  const handleBulkSplit = useCallback(() => {
    setShowBulkSplitModal(true);
  }, []);

  const handleCloseBulkSplit = useCallback(() => {
    setShowBulkSplitModal(false);
    // Exit selection mode after splitting
    setSelectedIds(new Set());
    setAddedTagIds(new Set());
    setSelectionMode(false);
  }, []);

  // Calculate totals from ALL transactions for the month (not just the filtered tab)
  // so the header always shows the same numbers as the dashboard
  // For split transactions, only count the user's share (is_my_share === true)
  const totals = useMemo(() => {
    if (!allTransactions) return { expenses: 0, returns: 0, income: 0, investments: 0, transfers: 0 };

    return allTransactions.reduce(
      (acc, t) => {
        const type = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');

        // For split transactions, sum only the user's share
        const amount = t.is_split && t.splits?.length
          ? t.splits.filter(s => s.is_my_share).reduce((sum, s) => sum + Math.abs(s.amount), 0)
          : Math.abs(t.amount);

        if (type === 'expense') {
          acc.expenses += amount;
        } else if (type === 'return') {
          acc.returns += amount;
        } else if (type === 'income') {
          acc.income += amount;
        } else if (type === 'investment') {
          acc.investments += amount;
        } else if (type === 'transfer') {
          acc.transfers += amount;
        }
        return acc;
      },
      { expenses: 0, returns: 0, income: 0, investments: 0, transfers: 0 }
    );
  }, [allTransactions]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Transactions</h1>
          {/* Desktop: single-line summary */}
          <p className="hidden sm:block text-slate-400 mt-1 text-base">
            <span>{transactions?.length || 0} transactions</span>
            <span> • </span>
            <span className="text-rose-400">-${(totals.expenses - totals.returns).toFixed(2)}</span>
            {totals.returns > 0 && (
              <span className="text-slate-500 ml-1">(${totals.returns.toFixed(2)} in returns)</span>
            )}
            <span className="text-emerald-400 ml-2">+${totals.income.toFixed(2)}</span>
            {expectedIncome > 0 && (
              <span className="text-slate-500"> of ${expectedIncome.toFixed(2)}</span>
            )}
            {totals.investments > 0 && (
              <span className="text-violet-400 ml-2">(${totals.investments.toFixed(2)} invested)</span>
            )}
            {totals.transfers > 0 && (
              <span className="text-slate-500 ml-2">(${totals.transfers.toFixed(2)} transfers)</span>
            )}
          </p>
          {/* Mobile: structured compact rows */}
          <div className="sm:hidden mt-1.5 text-xs text-slate-400 space-y-0.5">
            <p>{transactions?.length || 0} transactions</p>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap">
              <span className="text-rose-400">-${(totals.expenses - totals.returns).toFixed(2)}</span>
              {totals.returns > 0 && (
                <span className="text-slate-500">(${totals.returns.toFixed(2)} ret.)</span>
              )}
              <span className="text-emerald-400 ml-2">
                +${totals.income.toFixed(2)}
                {expectedIncome > 0 && (
                  <span className="text-slate-500"> / ${expectedIncome.toFixed(2)}</span>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Find Duplicates */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowDuplicates(true)}
            title="Find duplicate transactions"
            className="sm:!text-sm sm:!px-4 sm:!py-2"
          >
            <Copy className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Duplicates</span>
          </Button>

          {/* Selection Mode Toggle */}
          <Button
            variant={selectionMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={toggleSelectionMode}
            className="sm:!text-sm sm:!px-4 sm:!py-2"
          >
            {selectionMode ? (
              <>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </>
            ) : (
              <>
                <CheckSquare className="h-4 w-4 mr-2" />
                Select
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Transaction Type Tabs - Horizontally scrollable on mobile */}
      <div className="scroll-x-mobile gap-1 md:gap-2 bg-midnight-800 rounded-xl p-1 md:w-fit">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTypeFilter(tab.id)}
            className={`flex-shrink-0 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${typeFilter === tab.id
              ? 'bg-primary-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-midnight-700 active:bg-midnight-600'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <TransactionFilters
        filters={filters}
        onFilterChange={setFilters}
        categories={categories}
        accounts={accounts}
        tags={tags}
      />

      <TransactionList
        transactions={transactions}
        isLoading={isLoading}
        onEdit={handleEdit}
        onSplit={handleSplit}
        onDelete={handleDelete}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        selectionMode={selectionMode}
      />

      {/* Bulk Action Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          tags={tags}
          onAddTag={handleBulkAddTag}
          onSplit={handleBulkSplit}
          onDelete={handleBulkDelete}
          onDone={handleBulkDone}
          onCancel={handleCancelSelection}
          isLoading={bulkAddTag.isPending}
          isDeleting={bulkDeleteMutation.isPending}
          addedTagIds={addedTagIds}
        />
      )}

      <EditTransactionModal
        isOpen={!!editingTransaction}
        onClose={handleCloseEdit}
        transaction={editingTransaction}
      />

      <SplitTransactionModal
        isOpen={!!splittingTransaction}
        onClose={handleCloseSplit}
        transaction={splittingTransaction}
      />

      <BulkSplitModal
        isOpen={showBulkSplitModal}
        onClose={handleCloseBulkSplit}
        selectedCount={selectedIds.size}
        transactionIds={Array.from(selectedIds)}
      />

      <DuplicateReviewModal
        isOpen={showDuplicates}
        onClose={() => setShowDuplicates(false)}
      />

      {/* Delete Confirmation Modal */}
      {deletingTransaction && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCloseDelete} />
          <div className="relative bg-midnight-800 border border-midnight-600 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 mb-4 md:mb-0">
            <h3 className="text-lg font-semibold text-slate-100 mb-2">Delete Transaction</h3>
            <p className="text-sm text-slate-400 mb-1">
              Are you sure you want to delete this transaction?
            </p>
            <div className="bg-midnight-700 rounded-lg p-3 mb-4">
              <div className="font-medium text-slate-200">
                {deletingTransaction.merchant_display_name || deletingTransaction.merchant_name}
              </div>
              <div className="text-sm text-slate-400">
                ${Math.abs(deletingTransaction.amount).toFixed(2)} • {deletingTransaction.date}
              </div>
            </div>
            <p className="text-sm text-rose-400 mb-4">This action cannot be undone.</p>
            <div className="flex flex-col-reverse md:flex-row gap-3">
              <Button variant="secondary" onClick={handleCloseDelete} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                isLoading={deleteTransactionMutation.isPending}
                className="flex-1"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
