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
        <div className="bg-midnight-900 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-slate-300">
              {transaction.merchant_display_name || transaction.merchant_name}
            </span>
            <span className="font-semibold text-slate-100">
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
                <div className="flex items-center gap-2">
                  <span className={split.is_my_share ? 'text-slate-100' : 'text-slate-500'}>
                    {split.description || `Split ${index + 1}`}
                  </span>
                  {split.is_my_share && (
                    <span className="text-xs bg-accent-500/20 text-accent-400 px-2 py-0.5 rounded">
                      My share
                    </span>
                  )}
                </div>
                <span className={`font-medium ${split.is_my_share ? 'text-slate-100' : 'text-slate-500'}`}>
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
                  <div className="flex gap-3 items-start">
                    <div className="flex-1">
                      <Input
                        placeholder="Description"
                        value={split.description}
                        onChange={e => handleSplitChange(split.id, 'description', e.target.value)}
                      />
                    </div>
                    <div className="w-32">
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
                        className="p-2 text-slate-400 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={split.isMyShare}
                      onChange={e => handleSplitChange(split.id, 'isMyShare', e.target.checked)}
                      className="w-4 h-4 rounded border-midnight-500 bg-midnight-800 text-accent-500 focus:ring-accent-500 focus:ring-offset-midnight-900"
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
              className="flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300 transition-colors"
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
            <div className="flex gap-3 pt-4">
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

