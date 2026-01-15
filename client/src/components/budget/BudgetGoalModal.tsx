import { useState, useEffect } from 'react';
import { Modal, Button, Input, Select } from '../ui';
import type { BudgetGoal, Category } from '../../types';
import { useCreateBudgetGoal, useUpdateBudgetGoal, useDeleteBudgetGoal, useCategories } from '../../hooks';

interface BudgetGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  goal?: BudgetGoal | null;
  month: number;
  year: number;
}

export const BudgetGoalModal = ({ isOpen, onClose, goal, month, year }: BudgetGoalModalProps) => {
  const [categoryId, setCategoryId] = useState('');
  const [limitAmount, setLimitAmount] = useState('');
  const [applyToAllMonths, setApplyToAllMonths] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  const { data: categories = [] } = useCategories();
  const createGoal = useCreateBudgetGoal();
  const updateGoal = useUpdateBudgetGoal();
  const deleteGoal = useDeleteBudgetGoal();

  const isEditing = !!goal;

  useEffect(() => {
    if (goal) {
      setCategoryId(goal.category_id);
      setLimitAmount(goal.limit_amount.toString());
      setApplyToAllMonths(false);
    } else {
      setCategoryId('');
      setLimitAmount('');
      setApplyToAllMonths(false);
    }
  }, [goal]);

  const handleSave = async () => {
    const amount = parseFloat(limitAmount);
    if (!categoryId || isNaN(amount) || amount <= 0) return;

    setIsCreating(true);
    try {
      if (isEditing && goal) {
        await updateGoal.mutateAsync({
          id: goal.id,
          data: { limit_amount: amount },
        });
      } else if (applyToAllMonths) {
        // Create budget goals for all 12 months (skipExisting to handle any that exist)
        for (let m = 1; m <= 12; m++) {
          await createGoal.mutateAsync({
            data: {
              category_id: categoryId,
              month: m,
              year,
              limit_amount: amount,
            },
            skipExisting: true,
          });
        }
      } else {
        await createGoal.mutateAsync({
          data: {
            category_id: categoryId,
            month,
            year,
            limit_amount: amount,
          },
        });
      }
      onClose();
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!goal) return;
    await deleteGoal.mutateAsync(goal.id);
    onClose();
  };

  const categoryOptions = [
    { value: '', label: 'Select a category' },
    ...categories.map((c: Category) => ({ value: c.id, label: c.name })),
  ];

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={isEditing ? 'Edit Budget Goal' : 'Add Budget Goal'}
    >
      <div className="space-y-4">
        <Select
          label="Category"
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          options={categoryOptions}
          disabled={isEditing}
        />

        <Input
          label="Monthly Limit"
          type="number"
          value={limitAmount}
          onChange={e => setLimitAmount(e.target.value)}
          placeholder="0.00"
        />

        {!isEditing && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={applyToAllMonths}
              onChange={e => setApplyToAllMonths(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-midnight-700 text-cyan-500 focus:ring-cyan-500/20"
            />
            <span className="text-sm text-slate-300">
              Apply to all months in {year}
            </span>
          </label>
        )}

        <div className="flex gap-3 pt-4">
          {isEditing && (
            <Button
              variant="danger"
              onClick={handleDelete}
              isLoading={deleteGoal.isPending}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            isLoading={isCreating}
            disabled={!categoryId || !limitAmount}
            className="flex-1"
          >
            {isEditing ? 'Save' : applyToAllMonths ? 'Create for All Months' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

