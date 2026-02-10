import { useState, useCallback, useMemo } from 'react';
import { TrendingUp, Pencil, Check, X, Target, Plus, Trash2, Percent } from 'lucide-react';
import { Card, ProgressBar, Button, Input } from '../ui';
import { formatCurrency } from '../../utils/formatters';

export interface RecurringContribution {
  label: string;
  amount: number;
}

interface NetWorthGoalCardProps {
  currentNetWorth: number;
  effectiveCashSavings: number;
  effectiveInvestments: number;
  calculatedCashRetained: number;
  calculatedMonthlyInvested: number;
  isManualSavings: boolean;
  manualCashSavings: number | null;
  manualInvestments: number | null;
  totalInvestmentValue: number;
  estimatedReturnRate: number;
  cashReturnRate: number;
  goalAmount: number;
  goalYear: number;
  contributions: RecurringContribution[];
  onSaveGoal: (amount: number, year: number) => void;
  onSaveContributions: (contributions: RecurringContribution[]) => void;
  onSaveReturnRate: (rate: number) => void;
  onSaveCashReturnRate: (rate: number) => void;
  onSaveMonthlyInputs: (cashSavings: number | null, investments: number | null) => void;
}

const DEFAULT_CONTRIBUTION_PRESETS = [
  '401k Contribution',
  '401k Employer Match',
  'HSA Contribution',
  'IRA Contribution',
  'ESPP',
  'Brokerage',
];

/** Convert annual rate (%) to equivalent monthly multiplier. */
const toMonthlyMultiplier = (annualPct: number): number =>
  annualPct > 0 ? Math.pow(1 + annualPct / 100, 1 / 12) : 1;

/** Project net worth using month-by-month compound growth. */
const projectNetWorth = (
  currentInvestmentValue: number,
  currentCashNetBalance: number,
  monthlyInvested: number,
  monthlyCashRetained: number,
  monthlyContributions: number,
  annualReturnRate: number,
  annualCashReturnRate: number,
  months: number,
): number => {
  const investMultiplier = toMonthlyMultiplier(annualReturnRate);
  const cashMultiplier = toMonthlyMultiplier(annualCashReturnRate);

  let portfolio = currentInvestmentValue;
  let cash = currentCashNetBalance;

  for (let i = 0; i < months; i++) {
    portfolio += monthlyInvested + monthlyContributions;
    portfolio *= investMultiplier;
    cash += monthlyCashRetained;
    cash *= cashMultiplier;
  }

  return portfolio + cash;
};

/** Binary search for the annual investment return rate needed to hit a target net worth. */
const findRequiredReturn = (
  currentInvestmentValue: number,
  currentCashNetBalance: number,
  monthlyInvested: number,
  monthlyCashRetained: number,
  monthlyContributions: number,
  annualCashReturnRate: number,
  months: number,
  targetNetWorth: number,
): number | null => {
  if (months <= 0) return null;

  let lo = -20;
  let hi = 100;

  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const projected = projectNetWorth(
      currentInvestmentValue, currentCashNetBalance,
      monthlyInvested, monthlyCashRetained, monthlyContributions,
      mid, annualCashReturnRate, months,
    );
    if (projected < targetNetWorth) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (Math.abs(hi - lo) < 0.01) break;
  }

  const result = (lo + hi) / 2;
  if (result > 100 || result < -20) return null;
  return result;
};

export const NetWorthGoalCard = ({
  currentNetWorth,
  effectiveCashSavings,
  effectiveInvestments,
  calculatedCashRetained,
  calculatedMonthlyInvested,
  isManualSavings,
  manualCashSavings,
  manualInvestments,
  totalInvestmentValue,
  estimatedReturnRate,
  cashReturnRate,
  goalAmount,
  goalYear,
  contributions,
  onSaveGoal,
  onSaveContributions,
  onSaveReturnRate,
  onSaveCashReturnRate,
  onSaveMonthlyInputs,
}: NetWorthGoalCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingSavings, setIsEditingSavings] = useState(false);
  const [isEditingContributions, setIsEditingContributions] = useState(false);
  const [isEditingReturn, setIsEditingReturn] = useState(false);
  const [editAmount, setEditAmount] = useState(goalAmount.toString());
  const [editYear, setEditYear] = useState(goalYear.toString());
  const [editReturn, setEditReturn] = useState(estimatedReturnRate.toString());
  const [editCashReturn, setEditCashReturn] = useState(cashReturnRate.toString());
  const [editCashSavings, setEditCashSavings] = useState('');
  const [editInvestments, setEditInvestments] = useState('');
  const [editContributions, setEditContributions] = useState<RecurringContribution[]>(contributions);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Derived values
  const totalMonthlyContributions = useMemo(
    () => contributions.reduce((sum, c) => sum + c.amount, 0),
    [contributions],
  );

  const currentCashNetBalance = currentNetWorth - totalInvestmentValue;
  const totalMonthlyAdditions = effectiveCashSavings + effectiveInvestments + totalMonthlyContributions;

  const monthsRemaining = useMemo(() => {
    if (goalYear <= 0) return 0;
    const endMonth = 11;
    const monthsLeft = (goalYear - currentYear) * 12 + (endMonth - currentMonth);
    return Math.max(0, monthsLeft);
  }, [goalYear, currentYear, currentMonth]);

  // Compound projection
  const projectedNetWorth = useMemo(() => {
    return projectNetWorth(
      totalInvestmentValue,
      currentCashNetBalance,
      effectiveInvestments,
      effectiveCashSavings,
      totalMonthlyContributions,
      estimatedReturnRate,
      cashReturnRate,
      monthsRemaining,
    );
  }, [
    totalInvestmentValue, currentCashNetBalance, effectiveInvestments,
    effectiveCashSavings, totalMonthlyContributions, estimatedReturnRate, cashReturnRate, monthsRemaining,
  ]);

  const hasGoal = goalAmount > 0 && goalYear > 0;
  const progress = hasGoal ? Math.min((currentNetWorth / goalAmount) * 100, 100) : 0;
  const remaining = hasGoal ? Math.max(goalAmount - currentNetWorth, 0) : 0;
  const isOnTrack = hasGoal && projectedNetWorth >= goalAmount;
  const gap = hasGoal ? goalAmount - projectedNetWorth : 0;

  const requiredReturn = useMemo(() => {
    if (!hasGoal || isOnTrack || monthsRemaining <= 0) return null;
    return findRequiredReturn(
      totalInvestmentValue,
      currentCashNetBalance,
      effectiveInvestments,
      effectiveCashSavings,
      totalMonthlyContributions,
      cashReturnRate,
      monthsRemaining,
      goalAmount,
    );
  }, [
    hasGoal, isOnTrack, monthsRemaining, totalInvestmentValue, currentCashNetBalance,
    effectiveInvestments, effectiveCashSavings, totalMonthlyContributions, cashReturnRate, goalAmount,
  ]);

  const requiredMonthlySavings = hasGoal && monthsRemaining > 0
    ? Math.max((goalAmount - currentNetWorth) / monthsRemaining, 0)
    : 0;

  // --- Handlers ---
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

  // Savings editing (cash + investments)
  const handleStartEditSavings = useCallback(() => {
    setEditCashSavings(
      manualCashSavings !== null ? manualCashSavings.toString() : calculatedCashRetained.toString(),
    );
    setEditInvestments(
      manualInvestments !== null ? manualInvestments.toString() : calculatedMonthlyInvested.toString(),
    );
    setIsEditingSavings(true);
  }, [manualCashSavings, manualInvestments, calculatedCashRetained, calculatedMonthlyInvested]);

  const handleSaveSavings = useCallback(() => {
    const cash = parseFloat(editCashSavings) || 0;
    const invested = parseFloat(editInvestments) || 0;
    onSaveMonthlyInputs(cash, invested);
    setIsEditingSavings(false);
  }, [editCashSavings, editInvestments, onSaveMonthlyInputs]);

  const handleClearSavingsOverride = useCallback(() => {
    onSaveMonthlyInputs(null, null);
    setIsEditingSavings(false);
  }, [onSaveMonthlyInputs]);

  const handleCancelSavings = useCallback(() => {
    setIsEditingSavings(false);
  }, []);

  // Return rate editing
  const handleStartEditReturn = useCallback(() => {
    setEditReturn(estimatedReturnRate > 0 ? estimatedReturnRate.toString() : '');
    setEditCashReturn(cashReturnRate > 0 ? cashReturnRate.toString() : '');
    setIsEditingReturn(true);
  }, [estimatedReturnRate, cashReturnRate]);

  const handleSaveReturn = useCallback(() => {
    const rate = parseFloat(editReturn) || 0;
    const cashRate = parseFloat(editCashReturn) || 0;
    onSaveReturnRate(rate);
    onSaveCashReturnRate(cashRate);
    setIsEditingReturn(false);
  }, [editReturn, editCashReturn, onSaveReturnRate, onSaveCashReturnRate]);

  const handleCancelReturn = useCallback(() => {
    setIsEditingReturn(false);
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

  const unusedPresets = useMemo(() => {
    const usedLabels = new Set(editContributions.map(c => c.label));
    return DEFAULT_CONTRIBUTION_PRESETS.filter(p => !usedLabels.has(p));
  }, [editContributions]);

  const isAnyEditing = isEditing || isEditingSavings || isEditingContributions || isEditingReturn;

  // --- Empty state ---
  if (!hasGoal && !isEditing) {
    return (
      <Card className="border-dashed border-midnight-500 bg-midnight-800/50">
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Target className="h-10 w-10 text-slate-500 mb-3" />
          <h3 className="text-lg font-semibold text-slate-200 mb-1">Set a Net Worth Goal</h3>
          <p className="text-sm text-slate-400 mb-4 max-w-sm">
            Track your progress with compound projections based on savings, contributions, and estimated returns.
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
        {!isAnyEditing && (
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

          {/* Monthly Savings: Cash + Investments */}
          {isEditingSavings ? (
            <div className="p-3 bg-midnight-700 rounded-lg space-y-3">
              <p className="text-sm font-medium text-slate-200">Monthly Savings</p>
              <p className="text-xs text-slate-500">
                How much you save/invest per month from your bank accounts. Cash stays flat; investments compound at your estimated return rate.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Cash Savings"
                  type="number"
                  value={editCashSavings}
                  onChange={(e) => setEditCashSavings(e.target.value)}
                  placeholder="e.g., 500"
                />
                <Input
                  label="Investments"
                  type="number"
                  value={editInvestments}
                  onChange={(e) => setEditInvestments(e.target.value)}
                  placeholder="e.g., 2000"
                />
              </div>
              <p className="text-xs text-slate-500">
                From transactions: {formatCurrency(calculatedCashRetained)} cash + {formatCurrency(calculatedMonthlyInvested)} invested
              </p>
              <div className="flex items-center justify-between">
                {isManualSavings && (
                  <button
                    onClick={handleClearSavingsOverride}
                    className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                  >
                    Reset to calculated
                  </button>
                )}
                <div className="flex gap-2 ml-auto">
                  <Button variant="ghost" size="sm" onClick={handleCancelSavings}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveSavings}>
                    <Check className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-midnight-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-400 font-medium">
                  Monthly Savings {isManualSavings ? '(manual)' : '(from transactions)'}
                </p>
                <button
                  onClick={handleStartEditSavings}
                  className="text-xs text-accent-400 hover:text-accent-300 transition-colors"
                >
                  Edit
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-slate-300">Cash savings</span>
                  {isManualSavings && (
                    <span className="text-xs text-slate-500 ml-1.5">(calc: {formatCurrency(calculatedCashRetained)})</span>
                  )}
                </div>
                <span className="text-sm text-slate-200 font-medium">{formatCurrency(effectiveCashSavings)}/mo</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <div>
                  <span className="text-sm text-slate-300">Investments</span>
                  {isManualSavings && (
                    <span className="text-xs text-slate-500 ml-1.5">(calc: {formatCurrency(calculatedMonthlyInvested)})</span>
                  )}
                </div>
                <span className="text-sm text-slate-200 font-medium">{formatCurrency(effectiveInvestments)}/mo</span>
              </div>
              <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-midnight-600">
                <span className="text-xs text-slate-400">Subtotal</span>
                <span className="text-sm text-slate-200 font-semibold">
                  {formatCurrency(effectiveCashSavings + effectiveInvestments)}/mo
                </span>
              </div>
            </div>
          )}

          {/* Recurring Contributions (payroll) */}
          {isEditingContributions ? (
            <div className="p-3 bg-midnight-700 rounded-lg space-y-3">
              <p className="text-sm font-medium text-slate-200">Payroll Contributions</p>
              <p className="text-xs text-slate-500">
                Monthly amounts from payroll that don't appear as bank transactions (401k, HSA, employer match, etc.)
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
                <p className="text-xs text-slate-400 font-medium">Payroll Contributions</p>
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
                  No payroll contributions set. Add 401k, HSA, employer match, etc.
                </p>
              )}
            </div>
          )}

          {/* Estimated Return Rates */}
          {isEditingReturn ? (
            <div className="p-3 bg-midnight-700 rounded-lg space-y-3">
              <p className="text-sm font-medium text-slate-200">Estimated Annual Returns</p>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-500 mb-1">
                    Investment portfolio ({formatCurrency(totalInvestmentValue)})
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="w-32">
                      <Input
                        type="number"
                        value={editReturn}
                        onChange={(e) => setEditReturn(e.target.value)}
                        placeholder="e.g., 7"
                      />
                    </div>
                    <span className="text-sm text-slate-400">% / year</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">
                    Cash / HYSA ({formatCurrency(currentCashNetBalance)})
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="w-32">
                      <Input
                        type="number"
                        value={editCashReturn}
                        onChange={(e) => setEditCashReturn(e.target.value)}
                        placeholder="e.g., 4.5"
                      />
                    </div>
                    <span className="text-sm text-slate-400">% / year</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={handleCancelReturn}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveReturn}>
                  <Check className="h-4 w-4 mr-1" />
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-midnight-700 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-slate-400 font-medium">Estimated Annual Returns</p>
                <button
                  onClick={handleStartEditReturn}
                  className="text-xs text-accent-400 hover:text-accent-300 transition-colors"
                >
                  {estimatedReturnRate > 0 || cashReturnRate > 0 ? 'Edit' : '+ Set'}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Investments</span>
                <span className="text-sm text-slate-200 font-medium">
                  {estimatedReturnRate > 0 ? `${estimatedReturnRate}%` : 'Not set'}
                  <span className="text-xs text-slate-500 font-normal ml-1.5">
                    on {formatCurrency(totalInvestmentValue)}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-slate-300">Cash / HYSA</span>
                <span className="text-sm text-slate-200 font-medium">
                  {cashReturnRate > 0 ? `${cashReturnRate}%` : 'Not set'}
                  <span className="text-xs text-slate-500 font-normal ml-1.5">
                    on {formatCurrency(currentCashNetBalance)}
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* Projection Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-midnight-700 rounded-lg">
              <p className="text-xs text-slate-400 mb-0.5">Projected by end of {goalYear}</p>
              <p className={`text-lg font-bold ${isOnTrack ? 'text-emerald-400' : 'text-amber-400'}`}>
                {formatCurrency(projectedNetWorth)}
              </p>
              {(estimatedReturnRate > 0 || cashReturnRate > 0) && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {estimatedReturnRate > 0 && `${estimatedReturnRate}% inv`}
                  {estimatedReturnRate > 0 && cashReturnRate > 0 && ' + '}
                  {cashReturnRate > 0 && `${cashReturnRate}% HYSA`}
                </p>
              )}
            </div>
            <div className="p-3 bg-midnight-700 rounded-lg">
              <p className="text-xs text-slate-400 mb-0.5">Total Monthly Additions</p>
              <p className="text-lg font-bold text-slate-200">
                {formatCurrency(totalMonthlyAdditions)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {formatCurrency(effectiveCashSavings)} cash + {formatCurrency(effectiveInvestments)} invested + {formatCurrency(totalMonthlyContributions)} payroll
              </p>
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
                You're on track! At your current rate{estimatedReturnRate > 0 || cashReturnRate > 0 ? ` with ${[estimatedReturnRate > 0 && `${estimatedReturnRate}% investment`, cashReturnRate > 0 && `${cashReturnRate}% HYSA`].filter(Boolean).join(' + ')} returns` : ''}, you'll reach your goal
                {projectedNetWorth > goalAmount && ` and exceed it by ${formatCurrency(projectedNetWorth - goalAmount)}`}.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-amber-400">
                  {monthsRemaining > 0 ? (
                    <>
                      Projection falls short by <span className="font-semibold">{formatCurrency(Math.abs(gap))}</span>.
                      {' '}Without returns, you'd need <span className="font-semibold">{formatCurrency(requiredMonthlySavings)}/mo</span> total
                      ({formatCurrency(requiredMonthlySavings - totalMonthlyAdditions)}/mo more).
                    </>
                  ) : (
                    <>Goal deadline has passed. You're {formatCurrency(remaining)} short of your target.</>
                  )}
                </p>
                {requiredReturn !== null && monthsRemaining > 0 && (
                  <p className="text-sm text-amber-300 flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5 flex-shrink-0" />
                    At your current contributions, you'd need a <span className="font-semibold">{requiredReturn.toFixed(1)}% annual return</span> to hit your goal.
                  </p>
                )}
              </div>
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
