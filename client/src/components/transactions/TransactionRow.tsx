import { useState, useCallback } from 'react';
import { MoreHorizontal, Split, Tag, Edit2 } from 'lucide-react';
import clsx from 'clsx';
import type { Transaction } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Badge } from '../ui/Badge';

interface TransactionRowProps {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
  onSplit: (transaction: Transaction) => void;
}

export const TransactionRow = ({ transaction, onEdit, onSplit }: TransactionRowProps) => {
  const [showMenu, setShowMenu] = useState(false);
  
  const displayName = transaction.merchant_display_name || transaction.merchant_name;
  const isExpense = transaction.amount > 0;
  
  const handleToggleMenu = useCallback(() => {
    setShowMenu(prev => !prev);
  }, []);
  
  const handleEdit = useCallback(() => {
    setShowMenu(false);
    onEdit(transaction);
  }, [onEdit, transaction]);
  
  const handleSplit = useCallback(() => {
    setShowMenu(false);
    onSplit(transaction);
  }, [onSplit, transaction]);

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-midnight-700/50 transition-colors border-b border-midnight-700 last:border-b-0">
      {/* Category Icon */}
      <div 
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${transaction.category?.color || '#64748b'}20` }}
      >
        <span 
          className="text-sm"
          style={{ color: transaction.category?.color || '#64748b' }}
        >
          {transaction.category?.name?.charAt(0) || '?'}
        </span>
      </div>
      
      {/* Merchant & Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-100 truncate">{displayName}</span>
          {transaction.is_split && (
            <Badge color="#6366f1" size="sm">Split</Badge>
          )}
          {transaction.is_recurring && (
            <Badge color="#10b981" size="sm">Recurring</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>{formatDate(transaction.date)}</span>
          {transaction.category && (
            <>
              <span>•</span>
              <span>{transaction.category.name}</span>
            </>
          )}
          {transaction.account && (
            <>
              <span>•</span>
              <span>{transaction.account.institution_name}</span>
            </>
          )}
        </div>
        {transaction.tags && transaction.tags.length > 0 && (
          <div className="flex gap-1 mt-1">
            {transaction.tags.map(tag => (
              <Badge key={tag.id} color={tag.color} size="sm">
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
      
      {/* Amount */}
      <div className={clsx(
        'font-semibold tabular-nums',
        isExpense ? 'text-slate-100' : 'text-emerald-400'
      )}>
        {isExpense ? '-' : '+'}{formatCurrency(transaction.amount)}
      </div>
      
      {/* Actions */}
      <div className="relative">
        <button
          onClick={handleToggleMenu}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-midnight-600 rounded-lg transition-colors"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        
        {showMenu && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowMenu(false)} 
            />
            <div className="absolute right-0 top-full mt-1 w-40 bg-midnight-700 border border-midnight-600 rounded-lg shadow-xl z-20 py-1">
              <button
                onClick={handleEdit}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-midnight-600 transition-colors"
              >
                <Edit2 className="h-4 w-4" />
                Edit
              </button>
              <button
                onClick={handleSplit}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-midnight-600 transition-colors"
              >
                <Split className="h-4 w-4" />
                Split
              </button>
              <button
                onClick={handleEdit}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-midnight-600 transition-colors"
              >
                <Tag className="h-4 w-4" />
                Add Tag
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

