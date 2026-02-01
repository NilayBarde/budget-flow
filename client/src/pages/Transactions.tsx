import { useState, useCallback, useMemo } from 'react';
import { CheckSquare, X } from 'lucide-react';
import { TransactionList, TransactionFilters, EditTransactionModal, SplitTransactionModal, BulkSplitModal, BulkActionBar } from '../components/transactions';
import { Button } from '../components/ui';
import { useTransactions, useAccounts, useCategories, useTags, useBulkAddTagToTransactions } from '../hooks';
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
  const [filters, setFilters] = useState<Filters>({ month, year });
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [splittingTransaction, setSplittingTransaction] = useState<Transaction | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addedTagIds, setAddedTagIds] = useState<Set<string>>(new Set());
  const [showBulkSplitModal, setShowBulkSplitModal] = useState(false);

  // Build filters with transaction_type
  const queryFilters = useMemo(() => {
    const f: Filters = { ...filters };
    if (typeFilter !== 'all') {
      f.transaction_type = typeFilter;
    }
    return f;
  }, [filters, typeFilter]);

  const { data: transactions, isLoading } = useTransactions(queryFilters);
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: tags = [] } = useTags();
  const bulkAddTag = useBulkAddTagToTransactions();

  const handleEdit = useCallback((transaction: Transaction) => {
    setEditingTransaction(transaction);
  }, []);

  const handleSplit = useCallback((transaction: Transaction) => {
    setSplittingTransaction(transaction);
  }, []);

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

  // Calculate totals using transaction_type
  const totals = useMemo(() => {
    if (!transactions) return { expenses: 0, returns: 0, income: 0, investments: 0, transfers: 0 };
    
    return transactions.reduce(
      (acc, t) => {
        const type = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');
        const amount = Math.abs(t.amount);
        
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
  }, [transactions]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Transactions</h1>
          <p className="text-slate-400 mt-1 text-sm md:text-base">
          <span>{transactions?.length || 0} transactions</span>
          <span className="hidden sm:inline"> • </span>
          <br className="sm:hidden" />
          <span className="text-rose-400">-${totals.expenses.toFixed(2)}</span>
          {totals.returns > 0 && (
            <span className="text-emerald-400 ml-2">+${totals.returns.toFixed(2)} returns</span>
          )}
          <span className="text-emerald-400 ml-2">+${totals.income.toFixed(2)}</span>
          {totals.investments > 0 && (
            <span className="text-violet-400 ml-2 hidden md:inline">(${totals.investments.toFixed(2)} invested)</span>
          )}
          {totals.transfers > 0 && (
            <span className="text-slate-500 ml-2 hidden md:inline">(${totals.transfers.toFixed(2)} transfers)</span>
          )}
        </p>
        </div>
        
        {/* Selection Mode Toggle */}
        <Button
          variant={selectionMode ? 'primary' : 'secondary'}
          onClick={toggleSelectionMode}
          className="flex-shrink-0"
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

      {/* Transaction Type Tabs - Horizontally scrollable on mobile */}
      <div className="scroll-x-mobile gap-1 md:gap-2 bg-midnight-800 rounded-xl p-1 md:w-fit">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTypeFilter(tab.id)}
            className={`flex-shrink-0 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              typeFilter === tab.id
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
          onDone={handleBulkDone}
          onCancel={handleCancelSelection}
          isLoading={bulkAddTag.isPending}
          addedTagIds={addedTagIds}
        />
      )}

      <EditTransactionModal
        isOpen={!!editingTransaction}
        onClose={handleCloseEdit}
        transaction={editingTransaction}
        allTransactions={transactions}
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
    </div>
  );
};
