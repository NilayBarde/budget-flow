import { useState, useCallback, useMemo } from 'react';
import { TransactionList, TransactionFilters, EditTransactionModal, SplitTransactionModal } from '../components/transactions';
import { useTransactions, useAccounts, useCategories, useTags } from '../hooks';
import type { Transaction, TransactionFilters as Filters, TransactionType } from '../types';
import { getMonthYear } from '../utils/formatters';

type TypeFilter = TransactionType | 'all';

const TYPE_TABS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'expense', label: 'Expenses' },
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

  // Calculate totals using transaction_type
  const totals = useMemo(() => {
    if (!transactions) return { expenses: 0, income: 0, investments: 0, transfers: 0 };
    
    return transactions.reduce(
      (acc, t) => {
        const type = t.transaction_type || (t.amount > 0 ? 'expense' : 'income');
        const amount = Math.abs(t.amount);
        
        if (type === 'expense') {
          acc.expenses += amount;
        } else if (type === 'income') {
          acc.income += amount;
        } else if (type === 'investment') {
          acc.investments += amount;
        } else if (type === 'transfer') {
          acc.transfers += amount;
        }
        return acc;
      },
      { expenses: 0, income: 0, investments: 0, transfers: 0 }
    );
  }, [transactions]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Transactions</h1>
        <p className="text-slate-400 mt-1 text-sm md:text-base">
          <span>{transactions?.length || 0} transactions</span>
          <span className="hidden sm:inline"> • </span>
          <br className="sm:hidden" />
          <span className="text-rose-400">-${totals.expenses.toFixed(2)}</span>
          <span className="text-emerald-400 ml-2">+${totals.income.toFixed(2)}</span>
          {totals.investments > 0 && (
            <span className="text-violet-400 ml-2 hidden md:inline">(${totals.investments.toFixed(2)} invested)</span>
          )}
          {totals.transfers > 0 && (
            <span className="text-slate-500 ml-2 hidden md:inline">(${totals.transfers.toFixed(2)} transfers)</span>
          )}
        </p>
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
      />

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
    </div>
  );
};
