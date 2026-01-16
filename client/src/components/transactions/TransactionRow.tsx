import { useState, useCallback, useRef, useEffect } from 'react';
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
  const [openUpward, setOpenUpward] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  
  useEffect(() => {
    if (showMenu && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // If less than 150px below, open upward
      setOpenUpward(spaceBelow < 150);
    }
  }, [showMenu]);
  
  const displayName = transaction.merchant_display_name || transaction.merchant_name;
  const transactionType = transaction.transaction_type || (transaction.amount > 0 ? 'expense' : 'income');
  const isTransfer = transactionType === 'transfer';
  const isIncome = transactionType === 'income';
  const isInvestment = transactionType === 'investment';
  
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
    <div className={clsx(
      "flex items-center gap-4 px-4 py-3 hover:bg-midnight-700/50 transition-colors border-b border-midnight-700 last:border-b-0",
      isTransfer && "opacity-60"
    )}>
      {/* Category Icon */}
      <div 
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: isIncome ? '#10b98120' : isInvestment ? '#8b5cf620' : isTransfer ? '#64748b20' : `${transaction.category?.color || '#64748b'}20` }}
      >
        <span 
          className="text-sm"
          style={{ color: isIncome ? '#10b981' : isInvestment ? '#8b5cf6' : isTransfer ? '#64748b' : transaction.category?.color || '#64748b' }}
        >
          {isIncome ? '$' : isInvestment ? '📈' : isTransfer ? '↔' : transaction.category?.name?.charAt(0) || '?'}
        </span>
      </div>
      
      {/* Merchant & Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-100 truncate">{displayName}</span>
          {isTransfer && (
            <Badge color="#64748b" size="sm">Transfer</Badge>
          )}
          {isIncome && (
            <Badge color="#10b981" size="sm">Income</Badge>
          )}
          {isInvestment && (
            <Badge color="#8b5cf6" size="sm">Investment</Badge>
          )}
          {transaction.is_split && (
            <Badge color="#6366f1" size="sm">Split</Badge>
          )}
          {transaction.is_recurring && (
            <Badge color="#10b981" size="sm">Recurring</Badge>
          )}
        </div>
        {/* Show original description if different from display name */}
        {transaction.original_description && 
         transaction.original_description.toLowerCase() !== displayName.toLowerCase() && (
          <div className="text-xs text-slate-500 truncate">
            {transaction.original_description}
          </div>
        )}
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
        isIncome ? 'text-emerald-400' : isInvestment ? 'text-violet-400' : isTransfer ? 'text-slate-500' : 'text-slate-100'
      )}>
        {isIncome ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount))}
      </div>
      
      {/* Actions */}
      <div className="relative">
        <button
          ref={menuButtonRef}
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
            <div className={clsx(
              "absolute right-0 w-40 bg-midnight-700 border border-midnight-600 rounded-lg shadow-xl z-20 py-1",
              openUpward ? "bottom-full mb-1" : "top-full mt-1"
            )}>
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

