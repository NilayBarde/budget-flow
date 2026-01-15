import { useState, useCallback } from 'react';
import { TransactionList, TransactionFilters, EditTransactionModal, SplitTransactionModal } from '../components/transactions';
import { useTransactions, useAccounts, useCategories, useTags } from '../hooks';
import type { Transaction, TransactionFilters as Filters } from '../types';
import { getMonthYear } from '../utils/formatters';

export const Transactions = () => {
  const { month, year } = getMonthYear();
  const [filters, setFilters] = useState<Filters>({ month, year });
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [splittingTransaction, setSplittingTransaction] = useState<Transaction | null>(null);

  const { data: transactions, isLoading } = useTransactions(filters);
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

  // Calculate totals
  const totals = transactions?.reduce(
    (acc, t) => {
      if (t.amount > 0) {
        acc.expenses += t.amount;
      } else {
        acc.income += Math.abs(t.amount);
      }
      return acc;
    },
    { expenses: 0, income: 0 }
  ) || { expenses: 0, income: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Transactions</h1>
        <p className="text-slate-400 mt-1">
          {transactions?.length || 0} transactions • 
          <span className="text-rose-400 ml-1">-${totals.expenses.toFixed(2)}</span>
          <span className="text-emerald-400 ml-2">+${totals.income.toFixed(2)}</span>
        </p>
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

