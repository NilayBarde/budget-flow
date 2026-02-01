import { useState, useCallback } from 'react';
import { Modal, Button, Input } from '../ui';
import type { Transaction } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { useCreateSplit, useDeleteSplits } from '../../hooks';

interface SplitTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
}

const MY_PORTION_DESCRIPTION = 'Your portion';
const OTHERS_DESCRIPTION = 'Others';

export const SplitTransactionModal = ({ isOpen, onClose, transaction }: SplitTransactionModalProps) => {
  const [myAmount, setMyAmount] = useState('');
  const [othersAmount, setOthersAmount] = useState('');
  
  const createSplit = useCreateSplit();
  const deleteSplits = useDeleteSplits();

  const totalAmount = transaction?.amount || 0;

  const handleMyAmountChange = useCallback((value: string) => {
    setMyAmount(value);
    const enteredAmount = parseFloat(value) || 0;
    if (enteredAmount >= 0 && enteredAmount <= totalAmount) {
      setOthersAmount((totalAmount - enteredAmount).toFixed(2));
    }
  }, [totalAmount]);

  const handleOthersAmountChange = useCallback((value: string) => {
    setOthersAmount(value);
    const enteredAmount = parseFloat(value) || 0;
    if (enteredAmount >= 0 && enteredAmount <= totalAmount) {
      setMyAmount((totalAmount - enteredAmount).toFixed(2));
    }
  }, [totalAmount]);

  const handleSplitEvenly = useCallback((value: string) => {
    const numPeople = parseInt(value, 10);
    if (numPeople >= 2) {
      const myShare = (totalAmount / numPeople).toFixed(2);
      const othersShare = (totalAmount - parseFloat(myShare)).toFixed(2);
      setMyAmount(myShare);
      setOthersAmount(othersShare);
    }
  }, [totalAmount]);

  const handleSave = async () => {
    const myAmountNum = parseFloat(myAmount) || 0;
    const othersAmountNum = parseFloat(othersAmount) || 0;
    
    if (!transaction || Math.abs(totalAmount - myAmountNum - othersAmountNum) > 0.01) return;

    const splitData = [
      { amount: myAmountNum, description: MY_PORTION_DESCRIPTION, is_my_share: true },
      { amount: othersAmountNum, description: OTHERS_DESCRIPTION, is_my_share: false },
    ].filter(s => s.amount > 0);

    await createSplit.mutateAsync({
      transactionId: transaction.id,
      splits: splitData,
    });

    onClose();
    setMyAmount('');
    setOthersAmount('');
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
            {/* Split evenly option */}
            <div className="p-3 bg-midnight-900 rounded-lg">
              <div className="flex justify-between items-center gap-3">
                <span className="text-slate-300">Split evenly between</span>
                <div className="flex items-center gap-2">
                  <div className="w-16">
                    <Input
                      type="number"
                      placeholder="2"
                      min="2"
                      onChange={e => handleSplitEvenly(e.target.value)}
                    />
                  </div>
                  <span className="text-slate-400">people</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-midnight-600" />
              <span className="text-xs text-slate-500">or enter manually</span>
              <div className="flex-1 border-t border-midnight-600" />
            </div>

            <div className="space-y-3">
              {/* My portion */}
              <div className="p-3 bg-midnight-900 rounded-lg">
                <div className="flex justify-between items-center gap-3">
                  <span className="text-slate-300">Your portion</span>
                  <div className="w-32">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={myAmount}
                      onChange={e => handleMyAmountChange(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Others portion */}
              <div className="p-3 bg-midnight-900 rounded-lg">
                <div className="flex justify-between items-center gap-3">
                  <span className="text-slate-400">Others</span>
                  <div className="w-32">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={othersAmount}
                      onChange={e => handleOthersAmountChange(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse md:flex-row gap-3 pt-4">
              <Button variant="secondary" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                isLoading={createSplit.isPending}
                disabled={!myAmount || parseFloat(myAmount) <= 0}
                className="flex-1"
              >
                Save Split
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
