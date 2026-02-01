import { useState, useCallback } from 'react';
import { Modal, Button, Input } from '../ui';
import { useBulkSplitTransactions } from '../../hooks';

interface BulkSplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  transactionIds: string[];
}

export const BulkSplitModal = ({ isOpen, onClose, selectedCount, transactionIds }: BulkSplitModalProps) => {
  const [numPeople, setNumPeople] = useState('2');
  const bulkSplit = useBulkSplitTransactions();

  const handleSplit = useCallback(async () => {
    const people = parseInt(numPeople, 10);
    if (people < 2 || transactionIds.length === 0) return;

    await bulkSplit.mutateAsync({
      transactionIds,
      numPeople: people,
    });

    onClose();
    setNumPeople('2');
  }, [numPeople, transactionIds, bulkSplit, onClose]);

  const handleClose = useCallback(() => {
    setNumPeople('2');
    onClose();
  }, [onClose]);

  const people = parseInt(numPeople, 10) || 2;
  const yourShare = people > 0 ? (100 / people).toFixed(1) : '0';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Split Transactions" size="sm">
      <div className="space-y-4">
        <p className="text-slate-300">
          Split <span className="font-semibold text-slate-100">{selectedCount}</span> transaction{selectedCount !== 1 ? 's' : ''} evenly.
        </p>

        <div className="bg-midnight-900 rounded-lg p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-300">Split between</span>
            <div className="flex items-center gap-2">
              <div className="w-20">
                <Input
                  type="number"
                  value={numPeople}
                  onChange={e => setNumPeople(e.target.value)}
                  min="2"
                  max="20"
                />
              </div>
              <span className="text-slate-400">people</span>
            </div>
          </div>
        </div>

        <div className="bg-midnight-900/50 rounded-lg p-3 text-sm">
          <div className="flex justify-between text-slate-400">
            <span>Your share:</span>
            <span className="text-accent-400 font-medium">{yourShare}%</span>
          </div>
          <div className="flex justify-between text-slate-400 mt-1">
            <span>Others:</span>
            <span className="text-slate-500">{(100 - parseFloat(yourShare)).toFixed(1)}%</span>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Transactions that are already split will be skipped.
        </p>

        <div className="flex flex-col-reverse md:flex-row gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSplit}
            isLoading={bulkSplit.isPending}
            disabled={parseInt(numPeople, 10) < 2}
            className="flex-1"
          >
            Split {selectedCount} Transaction{selectedCount !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
