import { useState, useCallback, useMemo } from 'react';
import { TrendingUp, Pencil, Check, X, Target, Plus, Trash2 } from 'lucide-react';
import { Card, ProgressBar, Button, Input } from '../ui';
import { formatCurrency } from '../../utils/formatters';

export interface RecurringContribution {
  label: string;
  amount: number;
}

interface NetWorthGoalCardProps {
  currentNetWorth: number;
  monthlySavingsRate: number;
  goalAmount: number;
  goalYear: number;
  contributions: RecurringContribution[];
  onSaveGoal: (amount: number, year: number) => void;
  onSaveContributions: (contributions: RecurringContribution[]) => void;
}

const DEFAULT_CONTRIBUTION_PRESETS = [
  '401k Contribution',
  '401k Employer Match',
  'HSA Contribution',
  'IRA Contribution',
  'ESPP',
  'Brokerage',
];

export const NetWorthGoalCard = ({
  currentNetWorth,
  monthlySavingsRate,
  goalAmount,
  goalYear,
  contributions,
  onSaveGoal,
  onSaveContributions,
}: NetWorthGoalCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingContributions, setIsEditingContributions] = useState(false);
  const [editAmount, setEditAmount] = useState(goalAmount.toString());
  const [editYear, setEditYear] = useState(goalYear.toString());
  const [editContributions, setEditContributions] = useState<RecurringContribution[]>(contributions);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // Total monthly contributions from recurring items (401k, HSA, etc.)
  const totalMonthlyContributions = useMemo(
    () => contributions.reduce((sum, c) => sum + c.amount, 0),
    [contributions],
  );

  // Combined effective monthly growth = transaction savings + recurring contributions
  const effectiveMonthlyRate = monthlySavingsRate + totalMonthlyContributions;

  const handleStartEdit = useCallback(() => {
    setEditAmount(goalAmount > 0 ? goalAmount.toString() : '');
    setEditYear(goalYear > 0 ? goalYear.toString() : currentYear.toString());
    setIsEditing(true);
  }, [goalAmount, goalYear, currentYear]);

  const handleSave = useCallback(() => {
    const amount = parseFloat(editAmount);
    const year = parseInt(editYear, 10);
    if (amount > 0 && year >= currentYear) {
      onSaveGoal(amount, year);
      setIsEditing(false);
    }
  }, [editAmount, editYear, currentYear, onSaveGoal]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  // Contribution editing
  const handleStartEditContributions = useCallback(() => {
    setEditContributions(contributions.length > 0 ? [...contributions] : [{ label: '', amount: 0 }]);
    setIsEditingContributions(true);
  }, [contributions]);

  const handleSaveContributions = useCallback(() => {
    const validContributions = editContributions.filter(c => c.label.trim() && c.amount > 0);
    onSaveContributions(validContributions);
    setIsEditingContributions(false);
  }, [editContributions, onSaveContributions]);

  const handleCancelContributions = useCallback(() => {
    setIsEditingContributions(false);
  }, []);

  const handleAddContribution = useCallback(() => {
    setEditContributions(prev => [...prev, { label: '', amount: 0 }]);
  }, []);

  const handleRemoveContribution = useCallback((index: number) => {
    setEditContributions(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateContribution = useCallback((index: number, field: 'label' | 'amount', value: string) => {
    setEditContributions(prev => prev.map((c, i) => {
      if (i !== index) return c;
      return field === 'amount'
        ? { ...c, amount: parseFloat(value) || 0 }
        : { ...c, label: value };
    }));
  }, []);

  // Suggest presets not already used
  const unusedPresets = useMemo(() => {
    const usedLabels = new Set(editContributions.map(c => c.label));
    return DEFAULT_CONTRIBUTION_PRESETS.filter(p => !usedLabels.has(p));
  }, [editContributions]);

  // Calculate months remaining until end of goal year
  const monthsRemaining = useMemo(() => {
    if (goalYear <= 0) return 0;
    const endMonth = 11;
    const monthsLeft = (goalYear - currentYear) * 12 + (endMonth - currentMonth);
    return Math.max(0, monthsLeft);
  }, [goalYear, currentYear, currentMonth]);

  // Project net worth using effective monthly rate (savings + contributions)
  const projectedNetWorth = useMemo(() => {
    return currentNetWorth + effectiveMonthlyRate * monthsRemaining;
  }, [currentNetWorth, effectiveMonthlyRate, monthsRemaining]);

  const hasGoal = goalAmount > 0 && goalYear > 0;
  const progress = hasGoal ? Math.min((currentNetWorth / goalAmount) * 100, 100) : 0;
  const remaining = hasGoal ? Math.max(goalAmount - currentNetWorth, 0) : 0;
  const isOnTrack = hasGoal && projectedNetWorth >= goalAmount;
  const requiredMonthlySavings = hasGoal && monthsRemaining > 0
    ? Math.max((goalAmount - currentNetWorth) / monthsRemaining, 0)
    : 0;
  const gap = hasGoal ? goalAmount - projectedNetWorth : 0;

  if (!hasGoal && !isEditing) {
    return (
      <Card className="border-dashed border-midnight-500 bg-midnight-800/50">
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Target className="h-10 w-10 text-slate-500 mb-3" />
          <h3 className="text-lg font-semibold text-slate-200 mb-1">Set a Net Worth Goal</h3>
          <p className="text-sm text-slate-400 mb-4 max-w-sm">
            Track your progress toward a target net worth with projections based on your savings rate and recurring contributions.
          </p>
          <Button onClick={handleStartEdit} size="sm">
            <TrendingUp className="h-4 w-4 mr-2" />
            Set Goal
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-100">Net Worth Goal</h3>
        </div>
        {!isEditing && !isEditingContributions && (
          <Button variant="ghost" size="sm" onClick={handleStartEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Target Net Worth"
              type="number"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              placeholder="e.g., 100000"
            />
            <Input
              label="Target Year"
              type="number"
              value={editYear}
              onChange={(e) => setEditYear(e.target.value)}
              placeholder={currentYear.toString()}
              min={currentYear}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Check className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Current vs Goal */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm text-slate-400">Current Net Worth</span>
              <span className="text-xl font-bold text-slate-100">{formatCurrency(currentNetWorth)}</span>
            </div>
            <ProgressBar
              value={currentNetWorth}
              max={goalAmount}
              showLabel={false}
              size="md"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-slate-500">
                {progress.toFixed(1)}% of {formatCurrency(goalAmount)}
              </span>
              <span className="text-xs text-slate-400">
                {formatCurrency(remaining)} remaining
              </span>
            </div>
          </div>

          {/* Recurring Contributions */}
          {isEditingContributions ? (
            <div className="p-3 bg-midnight-700 rounded-lg space-y-3">
              <p className="text-sm font-medium text-slate-200">Monthly Contributions</p>
              <p className="text-xs text-slate-500">
                Add recurring monthly amounts that grow your net worth (401k, HSA, employer match, etc.)
              </p>
              {editContributions.map((contribution, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={contribution.label}
                    onChange={(e) => handleUpdateContribution(idx, 'label', e.target.value)}
                    placeholder="e.g., 401k Contribution"
                    className="flex-1"
                  />
                  <div className="w-28 flex-shrink-0">
                    <Input
                      type="number"
                      value={contribution.amount || ''}
                      onChange={(e) => handleUpdateContribution(idx, 'amount', e.target.value)}
                      placeholder="$/mo"
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveContribution(idx)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {/* Quick-add presets */}
              {unusedPresets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {unusedPresets.map(preset => (
                    <button
                      key={preset}
                      onClick={() => setEditContributions(prev => [...prev, { label: preset, amount: 0 }])}
                      className="text-xs px-2 py-1 bg-midnight-600 text-slate-400 hover:text-slate-200 rounded-md transition-colors"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={handleAddContribution}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCancelContributions}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveContributions}>
                    <Check className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-midnight-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-400 font-medium">Monthly Contributions</p>
                <button
                  onClick={handleStartEditContributions}
                  className="text-xs text-accent-400 hover:text-accent-300 transition-colors"
                >
                  {contributions.length > 0 ? 'Edit' : '+ Add'}
                </button>
              </div>
              {contributions.length > 0 ? (
                <div className="space-y-1.5">
                  {contributions.map((c, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">{c.label}</span>
                      <span className="text-sm text-slate-200 font-medium">{formatCurrency(c.amount)}/mo</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1.5 border-t border-midnight-600">
                    <span className="text-sm text-slate-400 font-medium">Total</span>
                    <span className="text-sm text-emerald-400 font-semibold">{formatCurrency(totalMonthlyContributions)}/mo</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No contributions set. Add 401k, HSA, employer match, etc. to improve your projection.
                </p>
              )}
            </div>
          )}

          {/* Projection */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-midnight-700 rounded-lg">
              <p className="text-xs text-slate-400 mb-0.5">Projected by end of {goalYear}</p>
              <p className={`text-lg font-bold ${isOnTrack ? 'text-emerald-400' : 'text-amber-400'}`}>
                {formatCurrency(projectedNetWorth)}
              </p>
            </div>
            <div className="p-3 bg-midnight-700 rounded-lg">
              <p className="text-xs text-slate-400 mb-0.5">Effective Monthly Rate</p>
              <p className="text-lg font-bold text-slate-200">
                {formatCurrency(effectiveMonthlyRate)}
              </p>
              {totalMonthlyContributions > 0 && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatCurrency(monthlySavingsRate)} savings + {formatCurrency(totalMonthlyContributions)} contributions
                </p>
              )}
            </div>
          </div>

          {/* On track indicator */}
          <div className={`p-3 rounded-lg border ${
            isOnTrack
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : 'bg-amber-500/5 border-amber-500/20'
          }`}>
            {isOnTrack ? (
              <p className="text-sm text-emerald-400">
                You're on track! At your current rate, you'll reach your goal
                {projectedNetWorth > goalAmount && ` and exceed it by ${formatCurrency(projectedNetWorth - goalAmount)}`}.
              </p>
            ) : (
              <p className="text-sm text-amber-400">
                {monthsRemaining > 0 ? (
                  <>
                    You need <span className="font-semibold">{formatCurrency(requiredMonthlySavings)}/mo</span> total to
                    reach your goal — that's <span className="font-semibold">{formatCurrency(requiredMonthlySavings - effectiveMonthlyRate)}/mo</span> more
                    than your current effective rate. Projection falls short by {formatCurrency(Math.abs(gap))}.
                  </>
                ) : (
                  <>Goal deadline has passed. You're {formatCurrency(remaining)} short of your target.</>
                )}
              </p>
            )}
          </div>

          {/* Timeline */}
          <p className="text-xs text-slate-500 text-center">
            {monthsRemaining > 0
              ? `${monthsRemaining} months remaining until end of ${goalYear}`
              : 'Goal deadline has passed'}
          </p>
        </div>
      )}
    </Card>
  );
};
