import { RefreshCw } from 'lucide-react';
import { Card, Button, Spinner, EmptyState, Badge } from '../components/ui';
import { useRecurringTransactions, useDetectRecurringTransactions } from '../hooks';
import { formatCurrency } from '../utils/formatters';
import { Repeat } from 'lucide-react';

export const Subscriptions = () => {
  const { data: recurring, isLoading } = useRecurringTransactions();
  const detectRecurring = useDetectRecurringTransactions();

  const activeSubscriptions = recurring?.filter(r => r.is_active) || [];
  const monthlyTotal = activeSubscriptions
    .filter(r => r.frequency === 'monthly')
    .reduce((sum, r) => sum + r.average_amount, 0);
  const yearlyTotal = activeSubscriptions
    .filter(r => r.frequency === 'yearly')
    .reduce((sum, r) => sum + r.average_amount, 0);
  const estimatedMonthly = monthlyTotal + (yearlyTotal / 12);

  if (isLoading) {
    return <Spinner className="py-12" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Subscriptions</h1>
          <p className="text-slate-400 mt-1">Track your recurring charges</p>
        </div>
        <Button 
          variant="secondary" 
          onClick={() => detectRecurring.mutate()}
          isLoading={detectRecurring.isPending}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Detect Subscriptions
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-slate-400">Monthly Subscriptions</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">
            {formatCurrency(monthlyTotal)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {activeSubscriptions.filter(r => r.frequency === 'monthly').length} active
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Yearly Subscriptions</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">
            {formatCurrency(yearlyTotal)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {activeSubscriptions.filter(r => r.frequency === 'yearly').length} active
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Est. Monthly Cost</p>
          <p className="text-2xl font-bold text-accent-400 mt-1">
            {formatCurrency(estimatedMonthly)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {formatCurrency(estimatedMonthly * 12)}/year
          </p>
        </Card>
      </div>

      {/* Subscriptions List */}
      {activeSubscriptions.length > 0 ? (
        <Card padding="none">
          <div className="divide-y divide-midnight-700">
            {activeSubscriptions.map(sub => (
              <div 
                key={sub.id} 
                className="flex items-center gap-4 px-6 py-4 hover:bg-midnight-700/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-accent-500/20 flex items-center justify-center">
                  <Repeat className="h-5 w-5 text-accent-400" />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-100">
                      {sub.merchant_display_name}
                    </span>
                    <Badge 
                      color={sub.frequency === 'monthly' ? '#6366f1' : '#f59e0b'}
                      size="sm"
                    >
                      {sub.frequency}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-400">
                    Last charged: {new Date(sub.last_seen).toLocaleDateString()}
                  </p>
                </div>
                
                <div className="text-right">
                  <p className="font-semibold text-slate-100">
                    {formatCurrency(sub.average_amount)}
                  </p>
                  <p className="text-xs text-slate-400">
                    /{sub.frequency === 'monthly' ? 'mo' : 'yr'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          title="No subscriptions detected"
          description="Click 'Detect Subscriptions' to automatically find recurring charges in your transactions."
          icon={<Repeat className="h-8 w-8 text-slate-400" />}
          action={
            <Button 
              onClick={() => detectRecurring.mutate()}
              isLoading={detectRecurring.isPending}
            >
              Detect Subscriptions
            </Button>
          }
        />
      )}
    </div>
  );
};

