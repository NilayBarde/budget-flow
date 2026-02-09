import { useState, useEffect } from 'react';
import { Modal, Button, Input } from '../ui';
import type { SavingsGoal } from '../../types';

const ICON_OPTIONS = [
  { value: 'piggy-bank', label: '🐷 Piggy Bank' },
  { value: 'home', label: '🏠 Home' },
  { value: 'car', label: '🚗 Car' },
  { value: 'plane', label: '✈️ Travel' },
  { value: 'graduation-cap', label: '🎓 Education' },
  { value: 'heart-pulse', label: '🏥 Health' },
  { value: 'briefcase', label: '💼 Business' },
  { value: 'gift', label: '🎁 Gift' },
  { value: 'shield', label: '🛡️ Emergency' },
  { value: 'trending-up', label: '📈 Investment' },
];

const COLOR_OPTIONS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#ef4444', // red
];

interface SavingsGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  goal?: SavingsGoal | null;
  onSave: (data: Omit<SavingsGoal, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export const SavingsGoalModal = ({ isOpen, onClose, goal, onSave, onDelete }: SavingsGoalModalProps) => {
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [icon, setIcon] = useState('piggy-bank');
  const [color, setColor] = useState('#6366f1');
  const [deadline, setDeadline] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!goal;

  useEffect(() => {
    if (goal) {
      setName(goal.name);
      setTargetAmount(goal.target_amount.toString());
      setCurrentAmount(goal.current_amount.toString());
      setMonthlyContribution(goal.monthly_contribution.toString());
      setIcon(goal.icon);
      setColor(goal.color);
      setDeadline(goal.deadline ?? '');
    } else {
      setName('');
      setTargetAmount('');
      setCurrentAmount('0');
      setMonthlyContribution('');
      setIcon('piggy-bank');
      setColor('#6366f1');
      setDeadline('');
    }
  }, [goal, isOpen]);

  const handleSave = async () => {
    const target = parseFloat(targetAmount);
    const current = parseFloat(currentAmount) || 0;
    const monthly = parseFloat(monthlyContribution) || 0;

    if (!name.trim() || isNaN(target) || target <= 0) return;

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        target_amount: target,
        current_amount: current,
        monthly_contribution: monthly,
        icon,
        color,
        deadline: deadline || null,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!goal || !onDelete) return;
    setIsSaving(true);
    try {
      await onDelete(goal.id);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const isValid = name.trim() && targetAmount && parseFloat(targetAmount) > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Savings Goal' : 'New Savings Goal'}
    >
      <div className="space-y-4">
        <Input
          label="Goal Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Emergency Fund, House Down Payment"
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Target Amount"
            type="number"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="10000"
            min="0"
            step="100"
          />
          <Input
            label="Saved So Far"
            type="number"
            value={currentAmount}
            onChange={(e) => setCurrentAmount(e.target.value)}
            placeholder="0"
            min="0"
            step="100"
          />
        </div>

        <Input
          label="Monthly Contribution"
          type="number"
          value={monthlyContribution}
          onChange={(e) => setMonthlyContribution(e.target.value)}
          placeholder="500"
          min="0"
          step="50"
        />

        <Input
          label="Target Date (optional)"
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />

        {/* Icon selector */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-300">Icon</label>
          <div className="flex flex-wrap gap-2">
            {ICON_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setIcon(opt.value)}
                className={`px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                  icon === opt.value
                    ? 'bg-accent-500/20 text-accent-400 border border-accent-500'
                    : 'bg-midnight-700 text-slate-300 border border-midnight-600 hover:bg-midnight-600'
                }`}
                title={opt.label}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Color selector */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-300">Color</label>
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-all ${
                  color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-midnight-800 scale-110' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col-reverse md:flex-row gap-3 pt-4">
          {isEditing && onDelete && (
            <Button
              variant="danger"
              onClick={handleDelete}
              isLoading={isSaving}
              className="md:flex-none"
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            isLoading={isSaving}
            disabled={!isValid}
            className="flex-1"
          >
            {isEditing ? 'Save Changes' : 'Create Goal'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
