import { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Button, Input, Select } from '../ui';
import type { Transaction, Category, Tag, TransactionType } from '../../types';
import { useUpdateTransaction, useCategories, useTags, useAddTagToTransaction, useRemoveTagFromTransaction } from '../../hooks';
import { Badge } from '../ui/Badge';
import { formatCurrency, formatDate } from '../../utils/formatters';

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
  allTransactions?: Transaction[];
}

export const EditTransactionModal = ({ isOpen, onClose, transaction, allTransactions = [] }: EditTransactionModalProps) => {
  const [merchantName, setMerchantName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [transactionType, setTransactionType] = useState<TransactionType>('expense');
  const [notes, setNotes] = useState('');
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [applyToAll, setApplyToAll] = useState(false);
  
  const updateTransaction = useUpdateTransaction();
  const { data: categories = [] } = useCategories();
  const { data: tags = [] } = useTags();
  const addTag = useAddTagToTransaction();
  const removeTag = useRemoveTagFromTransaction();

  // Find other transactions from the same merchant (excluding current one)
  const similarTransactions = useMemo(() => {
    if (!transaction) return [];
    return allTransactions.filter(
      t => t.merchant_name === transaction.merchant_name && t.id !== transaction.id
    );
  }, [transaction, allTransactions]);

  // Check if category actually changed
  const categoryChanged = transaction && categoryId !== (transaction.category_id || '');

  useEffect(() => {
    if (isOpen && transaction) {
      setMerchantName(transaction.merchant_display_name || transaction.merchant_name);
      setCategoryId(transaction.category_id || '');
      setTransactionType(transaction.transaction_type || 'expense');
      setNotes(transaction.notes || '');
      setSelectedTags(transaction.tags || []);
      setApplyToAll(false);
    }
  }, [isOpen, transaction]);

  const handleSave = async () => {
    if (!transaction) return;

    await updateTransaction.mutateAsync({
      id: transaction.id,
      data: {
        merchant_display_name: merchantName,
        category_id: categoryId || null,
        transaction_type: transactionType,
        notes: notes || null,
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

        {/* Show apply to all option only if there are similar transactions and category changed */}
        {similarTransactions.length > 0 && categoryChanged && (
          <div className="rounded-lg border border-midnight-600 bg-midnight-800/50 p-3 space-y-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={e => setApplyToAll(e.target.checked)}
                className="w-5 h-5 md:w-4 md:h-4 mt-0.5 rounded border-slate-600 bg-midnight-700 text-cyan-500 focus:ring-cyan-500/20"
              />
              <span className="text-sm text-slate-300">
                Also recategorize {similarTransactions.length} other{' '}
                <span className="font-medium text-slate-200">
                  {transaction?.merchant_display_name || transaction?.merchant_name}
                </span>{' '}
                transaction{similarTransactions.length !== 1 ? 's' : ''}?
              </span>
            </label>
            
            {applyToAll && (
              <div className="pl-7 md:pl-6 space-y-1 max-h-32 overflow-y-auto">
                {similarTransactions.slice(0, 5).map(t => (
                  <div key={t.id} className="flex justify-between text-xs text-slate-400">
                    <span>{formatDate(t.date)}</span>
                    <span className="text-slate-300">{formatCurrency(t.amount)}</span>
                  </div>
                ))}
                {similarTransactions.length > 5 && (
                  <div className="text-xs text-slate-500 italic">
                    +{similarTransactions.length - 5} more transactions
                  </div>
                )}
              </div>
            )}
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
