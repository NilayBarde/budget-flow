import { useState, useMemo, useCallback } from 'react';
import { Pencil, Check, Calculator, AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader } from '../ui';
import { formatCurrency } from '../../utils/formatters';

interface AllocationBarProps {
  /** Actual income received so far this month */
  actualIncome: number;
  fixedCosts: number;
  goalContributions: number;
  investments: number;
  actualSpent: number;
  /** Final expected income (calculated or manual override) */
  expectedIncome: number;
  /** The auto-calculated value from last 3 months */
  calculatedIncome: number;
  /** Whether the user has manually overridden the calculated value */
  isManualOverride: boolean;
  /** Number of months used to compute the average */
  monthsSampled: number;
  onOverrideChange: (value: number) => void;
  onClearOverride: () => void;
  budgetLimit?: number;
}

const FIXED_COSTS_COLOR = '#f97316'; // orange
const GOALS_COLOR = '#6366f1'; // indigo
const INVESTMENTS_COLOR = '#8b5cf6'; // violet
const DISCRETIONARY_COLOR = '#22c55e'; // green
const INCOME_COLOR = '#38bdf8'; // sky blue

export const AllocationBar = ({
  actualIncome,
  fixedCosts,
  goalContributions,
  investments,
  actualSpent,
  expectedIncome,
  calculatedIncome,
  isManualOverride,
  monthsSampled,
  onOverrideChange,
  onClearOverride,
  budgetLimit = 0,
}: AllocationBarProps) => {
  const [isEditingIncome, setIsEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState('');

  const planningIncome = expectedIncome;

  const { discretionary, fixedPct, goalsPct, investmentsPct, discretionaryPct, isOverAllocated } = useMemo(() => {
    const remaining = planningIncome - fixedCosts - goalContributions - investments;
    const disc = Math.max(remaining, 0);
    const isOver = remaining < 0;

    if (planningIncome <= 0) {
      return { discretionary: 0, fixedPct: 0, goalsPct: 0, investmentsPct: 0, discretionaryPct: 0, isOverAllocated: false };
    }

    const fixedPercent = Math.min((fixedCosts / planningIncome) * 100, 100);
    const goalsPercent = Math.min(
      (goalContributions / planningIncome) * 100,
      100 - fixedPercent
    );
    const investmentsPercent = Math.min(
      (investments / planningIncome) * 100,
      100 - fixedPercent - goalsPercent
    );

    return {
      discretionary: disc,
      fixedPct: fixedPercent,
      goalsPct: goalsPercent,
      investmentsPct: investmentsPercent,
      discretionaryPct: Math.max((disc / planningIncome) * 100, 0),
      isOverAllocated: isOver,
    };
  }, [planningIncome, fixedCosts, goalContributions, investments]);

  // Warning threshold: use specific Budget Limit if set, otherwise use (Fixed + Discretionary) i.e. Total - Savings
  const warningThreshold = budgetLimit > 0 ? budgetLimit : (fixedCosts + discretionary);
  const isOverSpent = actualSpent > warningThreshold;
  const remainingSafe = warningThreshold - actualSpent;

  const spentPct = planningIncome > 0 ? Math.min((actualSpent / planningIncome) * 100, 100) : 0;

  const handleStartEdit = useCallback(() => {
    setIncomeInput(expectedIncome > 0 ? expectedIncome.toString() : '');
    setIsEditingIncome(true);
  }, [expectedIncome]);

  const handleConfirmEdit = useCallback(() => {
    const parsed = parseFloat(incomeInput);
    if (!isNaN(parsed) && parsed > 0) {
      onOverrideChange(parsed);
    }
    setIsEditingIncome(false);
  }, [incomeInput, onOverrideChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleConfirmEdit();
      if (e.key === 'Escape') setIsEditingIncome(false);
    },
    [handleConfirmEdit],
  );

  const segments = [
    { label: 'Fixed Costs', amount: fixedCosts, color: FIXED_COSTS_COLOR, pct: fixedPct },
    { label: 'Savings Goals', amount: goalContributions, color: GOALS_COLOR, pct: goalsPct },
    { label: 'Investments', amount: investments, color: INVESTMENTS_COLOR, pct: investmentsPct },
    { label: 'Discretionary', amount: discretionary, color: DISCRETIONARY_COLOR, pct: discretionaryPct },
  ];

  const incomeReceivedPct =
    planningIncome > 0 ? Math.round((actualIncome / planningIncome) * 100) : 100;

  // Build subtitle describing the source
  const subtitle = (() => {
    if (planningIncome <= 0) return 'No income data available yet';
    if (isManualOverride) return `Manual: ${formatCurrency(planningIncome)}/mo`;
    if (monthsSampled > 0)
      return `Avg of last ${monthsSampled} month${monthsSampled === 1 ? '' : 's'}: ${formatCurrency(planningIncome)}/mo`;
    return `Based on ${formatCurrency(planningIncome)} income`;
  })();

  return (
    <Card>
      <CardHeader
        title="Monthly Allocation"
        subtitle={subtitle}
        action={
          <div className="flex items-center gap-1">
            {isEditingIncome ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">$</span>
                <input
                  type="number"
                  value={incomeInput}
                  onChange={(e) => setIncomeInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  className="w-24 bg-midnight-900 border border-midnight-500 rounded-lg px-2 py-1 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-500"
                  placeholder="0"
                  min="0"
                  step="100"
                />
                <button
                  onClick={handleConfirmEdit}
                  className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-midnight-600 rounded transition-colors"
                  aria-label="Confirm"
                >
                  <Check size={16} />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handleStartEdit}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2 py-1 hover:bg-midnight-700 rounded-lg transition-colors"
                  title="Manually override the calculated income"
                >
                  <Pencil size={12} />
                  Override
                </button>
                {isManualOverride && (
                  <button
                    onClick={onClearOverride}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2 py-1 hover:bg-midnight-700 rounded-lg transition-colors"
                    title={`Use calculated average (${formatCurrency(calculatedIncome)})`}
                  >
                    <Calculator size={12} />
                    Use avg
                  </button>
                )}
              </>
            )}
          </div>
        }
      />

      {/* Stacked bar */}
      <div className="relative mt-2">
        <div className="h-6 md:h-8 w-full bg-midnight-700 rounded-full overflow-hidden flex">
          {segments.map(
            (seg) =>
              seg.pct > 0 && (
                <div
                  key={seg.label}
                  className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
                  title={`${seg.label}: ${formatCurrency(seg.amount)}`}
                />
              ),
          )}
        </div>

        {/* Actual spent marker */}
        {planningIncome > 0 && actualSpent > 0 && (
          <div
            className="absolute top-0 h-6 md:h-8 w-0.5 bg-white/80 transition-all duration-500"
            style={{ left: `${spentPct}%` }}
            title={`Spent: ${formatCurrency(actualSpent)}`}
          >
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-300 whitespace-nowrap font-medium">
              Spent
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-400">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <span>{seg.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-0.5 bg-white/80 flex-shrink-0" />
          <span>Actual Spent</span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 mt-6">
        {/* Key Metrics */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-midnight-800/50 p-4 rounded-xl border border-midnight-700">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-400 mb-1">Safe to Spend</p>
                <p className={`text-2xl font-bold ${isOverSpent ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {formatCurrency(remainingSafe)}
                </p>
              </div>
              <div className={`p-2 rounded-lg bg-midnight-700 ${isOverSpent ? 'text-rose-400' : 'text-emerald-400'}`}>
                {isOverSpent ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {isOverSpent
                ? `You've exceeded your limit by ${formatCurrency(Math.abs(remainingSafe))}`
                : 'Remaining for food, fun, & shopping'}
            </p>
          </div>

          <div className="bg-midnight-800/50 p-4 rounded-xl border border-midnight-700">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-400 mb-1">Savings Rate</p>
                <p className="text-2xl font-bold text-violet-400">
                  {planningIncome > 0 ? ((investments + goalContributions) / planningIncome * 100).toFixed(1) : '0.0'}%
                </p>
              </div>
              <div className="p-2 rounded-lg bg-midnight-700 text-violet-400">
                <TrendingUp size={20} />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              You're saving {formatCurrency(investments + goalContributions)} per month.
            </p>
          </div>
        </div>
      </div>

      {isOverAllocated && (
        <div className="mt-4 p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">
            Fixed costs + goal contributions + investments exceed your income by{' '}
            {formatCurrency(fixedCosts + goalContributions + investments - planningIncome)}
          </p>
        </div>
      )}

      {/* Detailed Breakdown */}
      <h4 className="text-sm font-medium text-slate-300 mt-6 mb-3">Detailed Breakdown</h4>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatItem
          label="Expected Income"
          amount={planningIncome}
          color={INCOME_COLOR}
          sublabel={`${formatCurrency(actualIncome)} received (${incomeReceivedPct}%)`}
        />
        <StatItem label="Fixed Costs" amount={fixedCosts} color={FIXED_COSTS_COLOR} />
        <StatItem label="Goal Savings" amount={goalContributions} color={GOALS_COLOR} />
        <StatItem label="Investments" amount={investments} color={INVESTMENTS_COLOR} />
        <StatItem label="Spent So Far" amount={actualSpent} color="#94a3b8" />
      </div>
    </Card>
  );
};

const StatItem = ({
  label,
  amount,
  color,
  sublabel,
}: {
  label: string;
  amount: number;
  color: string;
  sublabel?: string;
}) => (
  <div className="text-center p-2 md:p-3 bg-midnight-700/50 rounded-lg">
    <p className="text-xs text-slate-400 mb-1">{label}</p>
    <p className="text-sm md:text-base font-semibold" style={{ color }}>
      {formatCurrency(amount)}
    </p>
    {sublabel && <p className="text-[10px] text-slate-500 mt-0.5">{sublabel}</p>}
  </div>
);
