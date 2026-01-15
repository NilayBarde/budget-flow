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
}

export const SplitTransactionModal = ({ isOpen, onClose, transaction }: SplitTransactionModalProps) => {
  const [splits, setSplits] = useState<SplitEntry[]>([
    { id: '1', amount: '', description: 'Your portion' },
    { id: '2', amount: '', description: 'Others' },
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
      description: '' 
    }]);
  }, []);

  const handleRemoveSplit = useCallback((id: string) => {
    setSplits(prev => prev.filter(s => s.id !== id));
  }, []);

  const handleSplitChange = useCallback((id: string, field: 'amount' | 'description', value: string) => {
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
      }));

    await createSplit.mutateAsync({
      transactionId: transaction.id,
      splits: splitData,
    });

    onClose();
    setSplits([
      { id: '1', amount: '', description: 'Your portion' },
      { id: '2', amount: '', description: 'Others' },
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
                <span className="text-slate-300">{split.description || `Split ${index + 1}`}</span>
                <span className="font-medium text-slate-100">{formatCurrency(split.amount)}</span>
              </div>
            ))}
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
                <div key={split.id} className="flex gap-3 items-start">
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

