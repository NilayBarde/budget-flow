import { useState, useCallback, useRef, useEffect } from 'react';
import { MoreHorizontal, Split, Tag, Edit2, AlertCircle, Clock, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { Transaction } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Badge } from '../ui/Badge';

interface TransactionRowProps {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
  onSplit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  isSelected?: boolean;
  onSelect?: (transactionId: string, selected: boolean) => void;
  selectionMode?: boolean;
}

export const TransactionRow = ({ transaction, onEdit, onSplit, onDelete, isSelected = false, onSelect, selectionMode = false }: TransactionRowProps) => {
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
  const isReturn = transactionType === 'return';
  
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

  const handleDelete = useCallback(() => {
    setShowMenu(false);
    onDelete(transaction);
  }, [onDelete, transaction]);

  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onSelect?.(transaction.id, e.target.checked);
  }, [onSelect, transaction.id]);

  const handleRowClick = useCallback(() => {
    if (selectionMode && onSelect) {
      onSelect(transaction.id, !isSelected);
    }
  }, [selectionMode, onSelect, transaction.id, isSelected]);

  // Calculate my share for split transactions
  const myShare = transaction.is_split && transaction.splits && transaction.splits.length > 0
    ? transaction.splits
        .filter(s => s.is_my_share)
        .reduce((sum, s) => sum + Math.abs(s.amount), 0)
    : null;
  
  // Display amount: my share if split, otherwise full amount
  const displayAmount = myShare !== null ? myShare : Math.abs(transaction.amount);
  const totalAmount = Math.abs(transaction.amount);
  const showSplitTotal = myShare !== null && myShare !== totalAmount;

  // Sort tags alphabetically
  const sortedTags = transaction.tags 
    ? [...transaction.tags].sort((a, b) => a.name.localeCompare(b.name))
    : [];

  // Get category display color
  const categoryColor = isReturn ? '#10b981' : isIncome ? '#10b981' : isInvestment ? '#8b5cf6' : isTransfer ? '#64748b' : transaction.category?.color || '#64748b';
  const categoryBgColor = `${categoryColor}20`;

  return (
    <div 
      className={clsx(
        "px-3 py-3 md:px-4 hover:bg-midnight-700/50 transition-colors border-b border-midnight-700 last:border-b-0",
        isTransfer && "opacity-60",
        isSelected && "bg-accent-500/10",
        selectionMode && "cursor-pointer"
      )}
      onClick={selectionMode ? handleRowClick : undefined}
    >
      {/* Desktop Layout */}
      <div className="hidden md:flex items-center gap-4">
        {/* Selection Checkbox */}
        {selectionMode && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            onClick={e => e.stopPropagation()}
            className="w-5 h-5 rounded border-slate-600 bg-midnight-700 text-accent-500 focus:ring-accent-500/20 flex-shrink-0"
          />
        )}
        
        {/* Category Icon */}
        <div 
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: categoryBgColor }}
        >
          <span className="text-sm" style={{ color: categoryColor }}>
            {isReturn ? '↩' : isIncome ? '$' : isInvestment ? '📈' : isTransfer ? '↔' : transaction.category?.name?.charAt(0) || '?'}
          </span>
        </div>
        
        {/* Merchant & Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-100 truncate">{displayName}</span>
            {transaction.pending && (
              <Badge color="#f97316" size="sm">
                <Clock className="h-3 w-3 mr-1 inline" />
                Pending
              </Badge>
            )}
            {isTransfer && <Badge color="#64748b" size="sm">Transfer</Badge>}
            {isReturn && <Badge color="#10b981" size="sm">Return</Badge>}
            {isIncome && <Badge color="#10b981" size="sm">Income</Badge>}
            {isInvestment && <Badge color="#8b5cf6" size="sm">Investment</Badge>}
            {transaction.is_split && <Badge color="#6366f1" size="sm">Split</Badge>}
            {transaction.is_recurring && <Badge color="#10b981" size="sm">Recurring</Badge>}
            {transaction.needs_review && (
              <Badge color="#f59e0b" size="sm">
                <AlertCircle className="h-3 w-3 mr-1 inline" />
                Review
              </Badge>
            )}
          </div>
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
          {sortedTags.length > 0 && (
            <div className="flex gap-1 mt-1">
              {sortedTags.map(tag => (
                <Badge key={tag.id} color={tag.color} size="sm">
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        
        {/* Amount */}
        <div className="text-right">
          <div className={clsx(
            'font-semibold tabular-nums',
            isReturn ? 'text-emerald-400' : isIncome ? 'text-emerald-400' : isInvestment ? 'text-violet-400' : isTransfer ? 'text-slate-500' : 'text-slate-100'
          )}>
            {isReturn ? '+' : isIncome ? '+' : '-'}{formatCurrency(displayAmount)}
          </div>
          {showSplitTotal && (
            <div className="text-xs text-slate-500 tabular-nums">
              of {formatCurrency(totalAmount)}
            </div>
          )}
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
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
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
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-400 hover:bg-midnight-600 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile Layout - Card Style */}
      <div className="md:hidden">
        {/* Top row: Icon, Merchant, Amount */}
        <div className="flex items-start gap-3">
          {/* Selection Checkbox - Mobile */}
          {selectionMode && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleCheckboxChange}
              onClick={e => e.stopPropagation()}
              className="w-5 h-5 mt-2.5 rounded border-slate-600 bg-midnight-700 text-accent-500 focus:ring-accent-500/20 flex-shrink-0"
            />
          )}
          
          {/* Category Icon */}
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: categoryBgColor }}
          >
            <span className="text-sm" style={{ color: categoryColor }}>
              {isReturn ? '↩' : isIncome ? '$' : isInvestment ? '📈' : isTransfer ? '↔' : transaction.category?.name?.charAt(0) || '?'}
            </span>
          </div>
          
          {/* Merchant info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-slate-100 truncate">{displayName}</span>
              {/* Amount - top right on mobile for quick scanning */}
              <div className="text-right flex-shrink-0">
                <span className={clsx(
                  'font-semibold tabular-nums',
                  isReturn ? 'text-emerald-400' : isIncome ? 'text-emerald-400' : isInvestment ? 'text-violet-400' : isTransfer ? 'text-slate-500' : 'text-slate-100'
                )}>
                  {isReturn ? '+' : isIncome ? '+' : '-'}{formatCurrency(displayAmount)}
                </span>
                {showSplitTotal && (
                  <div className="text-xs text-slate-500 tabular-nums">
                    of {formatCurrency(totalAmount)}
                  </div>
                )}
              </div>
            </div>
            
            {/* Date and category */}
            <div className="flex items-center gap-2 text-sm text-slate-400 mt-0.5">
              <span>{formatDate(transaction.date)}</span>
              {transaction.category && (
                <>
                  <span>•</span>
                  <span className="truncate">{transaction.category.name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Badges row */}
        {(transaction.pending || isTransfer || isReturn || isIncome || isInvestment || transaction.is_split || transaction.is_recurring || transaction.needs_review || sortedTags.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mt-2 ml-13">
            {transaction.pending && (
              <Badge color="#f97316" size="sm">
                <Clock className="h-3 w-3 mr-1 inline" />
                Pending
              </Badge>
            )}
            {isTransfer && <Badge color="#64748b" size="sm">Transfer</Badge>}
            {isReturn && <Badge color="#10b981" size="sm">Return</Badge>}
            {isIncome && <Badge color="#10b981" size="sm">Income</Badge>}
            {isInvestment && <Badge color="#8b5cf6" size="sm">Investment</Badge>}
            {transaction.is_split && <Badge color="#6366f1" size="sm">Split</Badge>}
            {transaction.is_recurring && <Badge color="#10b981" size="sm">Recurring</Badge>}
            {transaction.needs_review && (
              <Badge color="#f59e0b" size="sm">
                <AlertCircle className="h-3 w-3 mr-1 inline" />
                Review
              </Badge>
            )}
            {sortedTags.map(tag => (
              <Badge key={tag.id} color={tag.color} size="sm">
                {tag.name}
              </Badge>
            ))}
          </div>
        )}

        {/* Mobile action buttons - swipe hint or tap to expand could be added later */}
        <div className="flex justify-end gap-1 mt-2 -mr-1">
          <button
            onClick={handleEdit}
            className="p-2.5 text-slate-400 hover:text-slate-200 active:bg-midnight-600 rounded-lg transition-colors touch-target"
            aria-label="Edit transaction"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleSplit}
            className="p-2.5 text-slate-400 hover:text-slate-200 active:bg-midnight-600 rounded-lg transition-colors touch-target"
            aria-label="Split transaction"
          >
            <Split className="h-4 w-4" />
          </button>
          <button
            onClick={handleDelete}
            className="p-2.5 text-slate-400 hover:text-rose-400 active:bg-midnight-600 rounded-lg transition-colors touch-target"
            aria-label="Delete transaction"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
