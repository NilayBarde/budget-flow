import { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Input, Select } from '../ui';
import type { Transaction, Category, Tag, TransactionType } from '../../types';
import { useUpdateTransaction, useCategories, useTags, useAddTagToTransaction, useRemoveTagFromTransaction, useSimilarTransactionsCount } from '../../hooks';
import { Badge } from '../ui/Badge';

const TRANSACTION_TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'return', label: 'Return/Refund' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'investment', label: 'Investment' },
];

interface EditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
}

export const EditTransactionModal = ({ isOpen, onClose, transaction }: EditTransactionModalProps) => {
  const [merchantName, setMerchantName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [transactionType, setTransactionType] = useState<TransactionType>('expense');
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringAmount, setRecurringAmount] = useState('');
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [applyToAll, setApplyToAll] = useState(false);
  
  const updateTransaction = useUpdateTransaction();
  const { data: categories = [] } = useCategories();
  const { data: tags = [] } = useTags();
  const addTag = useAddTagToTransaction();
  const removeTag = useRemoveTagFromTransaction();

  // Fetch count of similar transactions from the backend (across all time)
  const { data: similarCountData } = useSimilarTransactionsCount(
    transaction?.merchant_name,
    transaction?.id
  );
  const similarCount = similarCountData?.count || 0;

  // Check if category or recurring status actually changed
  const categoryChanged = transaction && categoryId !== (transaction.category_id || '');
  const recurringChanged = transaction && isRecurring !== (transaction.is_recurring || false);

  useEffect(() => {
    if (isOpen && transaction) {
      setMerchantName(transaction.merchant_display_name || transaction.merchant_name);
      setCategoryId(transaction.category_id || '');
      setTransactionType(transaction.transaction_type || 'expense');
      setNotes(transaction.notes || '');
      setIsRecurring(transaction.is_recurring || false);
      setRecurringAmount('');
      setSelectedTags(transaction.tags || []);
      setApplyToAll(false);
    }
  }, [isOpen, transaction]);

  const handleSave = async () => {
    if (!transaction) return;

    const parsedRecurringAmount = recurringAmount ? parseFloat(recurringAmount) : undefined;

    await updateTransaction.mutateAsync({
      id: transaction.id,
      data: {
        merchant_display_name: merchantName,
        category_id: categoryId || null,
        transaction_type: transactionType,
        is_recurring: isRecurring,
        notes: notes || null,
        ...(isRecurring && parsedRecurringAmount ? { recurring_amount: parsedRecurringAmount } : {}),
      },
      applyToAll,
    });

    // Handle tag changes
    const currentTagIds = (transaction.tags || []).map(t => t.id);
    const newTagIds = selectedTags.map(t => t.id);
    
    const tagsToAdd = newTagIds.filter(id => !currentTagIds.includes(id));
    const tagsToRemove = currentTagIds.filter(id => !newTagIds.includes(id));

    for (const tagId of tagsToAdd) {
      await addTag.mutateAsync({ transactionId: transaction.id, tagId });
    }
    for (const tagId of tagsToRemove) {
      await removeTag.mutateAsync({ transactionId: transaction.id, tagId });
    }

    onClose();
  };

  const handleAddTag = useCallback((tagId: string) => {
    const tag = tags.find(t => t.id === tagId);
    if (tag && !selectedTags.find(t => t.id === tagId)) {
      setSelectedTags(prev => [...prev, tag]);
    }
  }, [tags, selectedTags]);

  const handleRemoveTag = useCallback((tagId: string) => {
    setSelectedTags(prev => prev.filter(t => t.id !== tagId));
  }, []);

  if (!transaction) return null;

  const categoryOptions = [
    { value: '', label: 'No Category' },
    ...categories.map((c: Category) => ({ value: c.id, label: c.name })),
  ];

  const availableTags = tags.filter(t => !selectedTags.find(st => st.id === t.id));
  const tagOptions = [
    { value: '', label: 'Add a tag...' },
    ...availableTags.map(t => ({ value: t.id, label: t.name })),
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Transaction" size="md">
      <div className="space-y-4">
        <Input
          label="Merchant Name"
          value={merchantName}
          onChange={e => setMerchantName(e.target.value)}
          placeholder="Enter merchant name"
        />

        <Select
          label="Category"
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          options={categoryOptions}
        />

        <Select
          label="Transaction Type"
          value={transactionType}
          onChange={e => setTransactionType(e.target.value as TransactionType)}
          options={TRANSACTION_TYPE_OPTIONS}
        />

        {/* Recurring toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={e => setIsRecurring(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-midnight-600 rounded-full peer peer-checked:bg-accent-500 transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-slate-300 rounded-full peer-checked:translate-x-4 peer-checked:bg-white transition-transform" />
          </div>
          <span className="text-sm text-slate-300">Recurring charge</span>
        </label>

        {/* Optional monthly amount override — visible when recurring is on */}
        {isRecurring && (
          <Input
            label="Monthly amount (optional override)"
            type="number"
            step="0.01"
            min="0"
            value={recurringAmount}
            onChange={e => setRecurringAmount(e.target.value)}
            placeholder="Leave blank to auto-calculate from history"
          />
        )}

        {/* Show apply to all option when there are similar transactions and category or recurring changed */}
        {similarCount > 0 && (categoryChanged || recurringChanged) && (
          <div className="rounded-lg border border-midnight-600 bg-midnight-800/50 p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={e => setApplyToAll(e.target.checked)}
                className="w-5 h-5 md:w-4 md:h-4 mt-0.5 rounded border-slate-600 bg-midnight-700 text-cyan-500 focus:ring-cyan-500/20"
              />
              <span className="text-sm text-slate-300">
                Apply changes to {similarCount} other{' '}
                <span className="font-medium text-slate-200">
                  {transaction?.merchant_display_name || transaction?.merchant_name}
                </span>{' '}
                transaction{similarCount !== 1 ? 's' : ''}?
              </span>
            </label>
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Tags</label>
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedTags.map(tag => (
                <Badge 
                  key={tag.id} 
                  color={tag.color}
                  onRemove={() => handleRemoveTag(tag.id)}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
          <Select
            value=""
            onChange={e => {
              if (e.target.value) handleAddTag(e.target.value);
            }}
            options={tagOptions}
          />
        </div>

        <Input
          label="Notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add notes..."
        />

        <div className="flex flex-col-reverse md:flex-row gap-3 pt-4">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            isLoading={updateTransaction.isPending}
            className="flex-1"
          >
            Save Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
};
