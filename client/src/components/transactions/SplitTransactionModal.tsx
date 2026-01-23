import { useState, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal, Button, Input } from '../ui';
import type { Transaction } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { useCreateSplit, useDeleteSplits } from '../../hooks';

interface SplitTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
}

interface SplitEntry {
  id: string;
  amount: string;
  description: string;
  isMyShare: boolean;
}

export const SplitTransactionModal = ({ isOpen, onClose, transaction }: SplitTransactionModalProps) => {
  const [splits, setSplits] = useState<SplitEntry[]>([
    { id: '1', amount: '', description: 'Your portion', isMyShare: true },
    { id: '2', amount: '', description: 'Others', isMyShare: false },
  ]);
  
  const createSplit = useCreateSplit();
  const deleteSplits = useDeleteSplits();

  const totalAmount = transaction?.amount || 0;
  const splitTotal = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const remaining = totalAmount - splitTotal;

  const handleAddSplit = useCallback(() => {
    setSplits(prev => [...prev, { 
      id: Date.now().toString(), 
      amount: '', 
      description: '',
      isMyShare: false,
    }]);
  }, []);

  const handleRemoveSplit = useCallback((id: string) => {
    setSplits(prev => prev.filter(s => s.id !== id));
  }, []);

  const handleSplitChange = useCallback((id: string, field: 'amount' | 'description' | 'isMyShare', value: string | boolean) => {
    setSplits(prev => prev.map(s => 
      s.id === id ? { ...s, [field]: value } : s
    ));
  }, []);

  const handleSave = async () => {
    if (!transaction || Math.abs(remaining) > 0.01) return;

    const splitData = splits
      .filter(s => parseFloat(s.amount) > 0)
      .map(s => ({
        amount: parseFloat(s.amount),
        description: s.description,
        is_my_share: s.isMyShare,
      }));

    await createSplit.mutateAsync({
      transactionId: transaction.id,
      splits: splitData,
    });

    onClose();
    setSplits([
      { id: '1', amount: '', description: 'Your portion', isMyShare: true },
      { id: '2', amount: '', description: 'Others', isMyShare: false },
    ]);
  };

  const handleRemoveAllSplits = async () => {
    if (!transaction) return;
    await deleteSplits.mutateAsync(transaction.id);
    onClose();
  };

  if (!transaction) return null;

  const hasSplits = transaction.is_split && transaction.splits && transaction.splits.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Split Transaction" size="md">
      <div className="space-y-4">
        {/* Transaction Info */}
        <div className="bg-midnight-900 rounded-lg p-3 md:p-4">
          <div className="flex justify-between items-center gap-2">
            <span className="text-slate-300 truncate">
              {transaction.merchant_display_name || transaction.merchant_name}
            </span>
            <span className="font-semibold text-slate-100 flex-shrink-0">
              {formatCurrency(totalAmount)}
            </span>
          </div>
        </div>

        {hasSplits ? (
          /* Existing Splits View */
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-300">Current Splits</h4>
            {transaction.splits?.map((split, index) => (
              <div key={split.id} className="flex justify-between items-center bg-midnight-900 rounded-lg p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`truncate ${split.is_my_share ? 'text-slate-100' : 'text-slate-500'}`}>
                    {split.description || `Split ${index + 1}`}
                  </span>
                  {split.is_my_share && (
                    <span className="text-xs bg-accent-500/20 text-accent-400 px-2 py-0.5 rounded flex-shrink-0">
                      My share
                    </span>
                  )}
                </div>
                <span className={`font-medium flex-shrink-0 ml-2 ${split.is_my_share ? 'text-slate-100' : 'text-slate-500'}`}>
                  {formatCurrency(split.amount)}
                </span>
              </div>
            ))}
            <div className="pt-2 border-t border-midnight-600">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Your total:</span>
                <span className="text-accent-400 font-medium">
                  {formatCurrency(
                    transaction.splits?.filter(s => s.is_my_share).reduce((sum, s) => sum + s.amount, 0) || 0
                  )}
                </span>
              </div>
            </div>
            <Button
              variant="danger"
              onClick={handleRemoveAllSplits}
              isLoading={deleteSplits.isPending}
              className="w-full mt-4"
            >
              Remove All Splits
            </Button>
          </div>
        ) : (
          /* New Split Entry */
          <>
            <div className="space-y-3">
              {splits.map((split, index) => (
                <div key={split.id} className="space-y-2 p-3 bg-midnight-900 rounded-lg">
                  {/* Mobile: Stack inputs */}
                  <div className="flex flex-col md:flex-row gap-2 md:gap-3 md:items-start">
                    <div className="flex-1">
                      <Input
                        placeholder="Description"
                        value={split.description}
                        onChange={e => handleSplitChange(split.id, 'description', e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 md:w-32 md:flex-none">
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={split.amount}
                          onChange={e => handleSplitChange(split.id, 'amount', e.target.value)}
                        />
                      </div>
                      {index > 1 && (
                        <button
                          onClick={() => handleRemoveSplit(split.id)}
                          className="p-2.5 text-slate-400 hover:text-rose-400 active:bg-midnight-700 rounded-lg transition-colors touch-target"
                          aria-label="Remove split"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={split.isMyShare}
                      onChange={e => handleSplitChange(split.id, 'isMyShare', e.target.checked)}
                      className="w-5 h-5 md:w-4 md:h-4 rounded border-midnight-500 bg-midnight-800 text-accent-500 focus:ring-accent-500 focus:ring-offset-midnight-900"
                    />
                    <span className="text-sm text-slate-400">
                      Count toward my expenses
                    </span>
                  </label>
                </div>
              ))}
            </div>

            <button
              onClick={handleAddSplit}
              className="flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300 active:text-accent-500 transition-colors py-2"
            >
              <Plus className="h-4 w-4" />
              Add another split
            </button>

            {/* Remaining Amount */}
            <div className="flex justify-between items-center pt-4 border-t border-midnight-600">
              <span className="text-slate-400">Remaining</span>
              <span className={remaining === 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {formatCurrency(remaining)}
              </span>
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse md:flex-row gap-3 pt-4">
              <Button variant="secondary" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                isLoading={createSplit.isPending}
                disabled={Math.abs(remaining) > 0.01}
                className="flex-1"
              >
                Save Splits
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
