import { useState, useCallback } from 'react';
import { X, Plus } from 'lucide-react';
import { Modal, Button, Input } from '../ui';
import type { Transaction } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { useCreateSplit, useDeleteSplits, useAddSplitPerson } from '../../hooks';

interface SplitTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
}

const MY_PORTION_DESCRIPTION = 'Your portion';

interface PersonRow {
  key: string;
  name: string;
  amount: string;
}

let rowCounter = 0;
const newRow = (amount = ''): PersonRow => ({ key: `row-${++rowCounter}`, name: '', amount });

export const SplitTransactionModal = ({ isOpen, onClose, transaction }: SplitTransactionModalProps) => {
  const [myAmount, setMyAmount] = useState('');
  const [people, setPeople] = useState<PersonRow[]>([newRow()]);
  const [addPersonName, setAddPersonName] = useState('');
  const [addPersonAmount, setAddPersonAmount] = useState('');
  const [addPersonError, setAddPersonError] = useState<string | null>(null);

  const createSplit = useCreateSplit();
  const deleteSplits = useDeleteSplits();
  const addSplitPerson = useAddSplitPerson();

  const totalAmount = transaction?.amount || 0;

  const resetNewSplitForm = useCallback(() => {
    setMyAmount('');
    setPeople([newRow()]);
  }, []);

  const handleSplitEvenly = useCallback((value: string) => {
    const numPeople = parseInt(value, 10);
    if (!(numPeople >= 2)) return;

    const round = (n: number) => Math.round(n * 100) / 100;
    const share = round(totalAmount / numPeople);
    const othersCount = numPeople - 1;
    const othersRows = Array.from({ length: othersCount }, () => newRow(share.toFixed(2)));

    // The even division may not land exactly on cents; put the leftover on your own portion
    // so every other person's row stays at the clean, round-number share.
    const drift = round(totalAmount - share * numPeople);
    setMyAmount((share + drift).toFixed(2));
    setPeople(othersRows);
  }, [totalAmount]);

  const handleAddRow = useCallback(() => {
    setPeople(prev => [...prev, newRow()]);
  }, []);

  const handleRemoveRow = useCallback((key: string) => {
    setPeople(prev => (prev.length > 1 ? prev.filter(p => p.key !== key) : prev));
  }, []);

  const handleRowChange = useCallback((key: string, field: 'name' | 'amount', value: string) => {
    setPeople(prev => prev.map(p => (p.key === key ? { ...p, [field]: value } : p)));
  }, []);

  const peopleTotal = people.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const myAmountNum = parseFloat(myAmount) || 0;
  const totalsMatch = Math.abs(totalAmount - myAmountNum - peopleTotal) <= 0.01;
  const hasAtLeastOnePerson = people.some(p => (parseFloat(p.amount) || 0) > 0);

  const handleSave = async () => {
    if (!transaction || !totalsMatch || !hasAtLeastOnePerson) return;

    const splitData = [
      { amount: myAmountNum, description: MY_PORTION_DESCRIPTION, is_my_share: true },
      ...people
        .filter(p => (parseFloat(p.amount) || 0) > 0)
        .map(p => ({ amount: parseFloat(p.amount), description: p.name.trim() || 'Other', is_my_share: false })),
    ].filter(s => s.amount > 0);

    await createSplit.mutateAsync({ transactionId: transaction.id, splits: splitData });

    onClose();
    resetNewSplitForm();
  };

  const handleRemoveAllSplits = async () => {
    if (!transaction) return;
    await deleteSplits.mutateAsync(transaction.id);
    onClose();
  };

  const handleAddPerson = async () => {
    if (!transaction) return;
    setAddPersonError(null);
    const amount = parseFloat(addPersonAmount);
    if (!addPersonName.trim() || !(amount > 0)) return;

    try {
      await addSplitPerson.mutateAsync({ transactionId: transaction.id, name: addPersonName.trim(), amount });
      setAddPersonName('');
      setAddPersonAmount('');
    } catch (error) {
      setAddPersonError(error instanceof Error ? error.message : 'Could not add that person');
    }
  };

  if (!transaction) return null;

  const hasSplits = transaction.is_split && transaction.splits && transaction.splits.length > 0;
  const myShareSplit = transaction.splits?.find(s => s.is_my_share);

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

            {/* Add another person, carved out of your own portion */}
            <div className="p-3 bg-midnight-900 rounded-lg space-y-2">
              <span className="text-sm text-slate-300">Add a person</span>
              <div className="flex gap-2">
                <Input
                  placeholder="Name"
                  value={addPersonName}
                  onChange={e => setAddPersonName(e.target.value)}
                  className="flex-1"
                />
                <div className="w-24">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={addPersonAmount}
                    onChange={e => setAddPersonAmount(e.target.value)}
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={handleAddPerson}
                  isLoading={addSplitPerson.isPending}
                  disabled={!addPersonName.trim() || !(parseFloat(addPersonAmount) > 0)}
                >
                  Add
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Taken out of your own portion ({formatCurrency(myShareSplit?.amount || 0)} left).
              </p>
              {addPersonError && (
                <p role="alert" className="text-xs text-rose-400">{addPersonError}</p>
              )}
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
                      onChange={e => setMyAmount(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* One row per person, each their own name + amount */}
              {people.map(person => (
                <div key={person.key} className="p-3 bg-midnight-900 rounded-lg flex items-center gap-2">
                  <Input
                    placeholder="Name (optional)"
                    value={person.name}
                    onChange={e => handleRowChange(person.key, 'name', e.target.value)}
                    className="flex-1"
                  />
                  <div className="w-28">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={person.amount}
                      onChange={e => handleRowChange(person.key, 'amount', e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Remove person"
                    onClick={() => handleRemoveRow(person.key)}
                    disabled={people.length === 1}
                    className="text-slate-500 hover:text-rose-400 disabled:opacity-30 disabled:hover:text-slate-500 p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <Button variant="ghost" size="sm" onClick={handleAddRow} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Add another person
              </Button>

              {!totalsMatch && (myAmountNum > 0 || peopleTotal > 0) && (
                <p className="text-xs text-rose-400">
                  Portions add up to {formatCurrency(myAmountNum + peopleTotal)}, not {formatCurrency(totalAmount)}.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse md:flex-row gap-3 pt-4">
              <Button variant="secondary" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                isLoading={createSplit.isPending}
                disabled={!totalsMatch || !hasAtLeastOnePerson || myAmountNum < 0}
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
