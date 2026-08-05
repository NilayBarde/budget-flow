import { useState, useCallback } from 'react';
import { Repeat, ChevronDown, ChevronUp, X, BadgeCheck, CreditCard } from 'lucide-react';
import clsx from 'clsx';
import { Card, Badge, Spinner } from '../ui';
import { useRecurringOverview, useUpdateRecurringTransaction } from '../../hooks';
import { formatCurrency } from '../../utils/formatters';

const FREQUENCY_COLORS: Record<string, string> = {
  weekly: '#14b8a6',
  monthly: '#6366f1',
  yearly: '#f59e0b',
};

export const SubscriptionOverview = () => {
  const { data: overview, isLoading } = useRecurringOverview();
  const updateRecurring = useUpdateRecurringTransaction();
  const [open, setOpen] = useState(false);

  const handleHide = useCallback(
    (id: string) => {
      updateRecurring.mutate({ id, data: { user_hidden: true } });
    },
    [updateRecurring]
  );

  const charges = overview?.charges ?? [];
  const credits = overview?.credits ?? [];
  const cards = overview?.cards ?? [];
  const summary = overview?.summary;

  return (
    <Card padding="none">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-4 md:px-6 py-3 md:py-4 text-left hover:bg-midnight-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Repeat className="h-5 w-5 text-accent-400" />
          <div>
            <p className="text-sm md:text-base font-medium text-slate-100">
              Subscriptions & Recurring
            </p>
            <p className="text-xs text-slate-400">
              {isLoading || !summary
                ? 'Analyzing charges and card credits...'
                : `True cost ~${formatCurrency(summary.net_monthly)}/mo (sticker ${formatCurrency(summary.gross_monthly)}, credits cover ${formatCurrency(summary.credits_monthly)})`}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 text-slate-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-midnight-700">
          {isLoading ? (
            <div className="py-8 flex justify-center">
              <Spinner />
            </div>
          ) : (
            <>
              {/* Recurring charges with net cost */}
              {charges.length > 0 ? (
                <div className="divide-y divide-midnight-700">
                  {charges.map(charge => {
                    const covered =
                      (charge.offset_monthly_amount ?? 0) > 0 && charge.net_monthly <= 0.01;
                    return (
                      <div
                        key={charge.id}
                        className="px-4 md:px-6 py-3 hover:bg-midnight-700/50 transition-colors flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-100 text-sm truncate">
                              {charge.merchant}
                            </span>
                            <Badge color={FREQUENCY_COLORS[charge.frequency]} size="sm">
                              {charge.frequency}
                            </Badge>
                            {covered && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                                <BadgeCheck className="h-3.5 w-3.5" />
                                Covered by card
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Last: {new Date(charge.last_seen + 'T00:00:00').toLocaleDateString()}
                            {charge.offset_merchant_name && (
                              <span className="text-slate-500"> · offset by {charge.offset_merchant_name}</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p
                            className={clsx(
                              'font-semibold text-sm',
                              covered ? 'text-emerald-400' : 'text-slate-100'
                            )}
                          >
                            {formatCurrency(charge.net_monthly)}/mo
                          </p>
                          {(charge.offset_monthly_amount ?? 0) > 0 && (
                            <p className="text-xs text-slate-500 line-through">
                              {formatCurrency(charge.monthly_amount)}/mo
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleHide(charge.id)}
                          className="p-2 text-slate-500 hover:text-red-400 active:bg-red-500/10 rounded-lg transition-colors flex-shrink-0 touch-target"
                          title="Hide this subscription"
                          aria-label="Hide subscription"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 md:px-6 py-8 text-center">
                  <p className="text-slate-400 text-sm">
                    No recurring charges detected yet. They appear automatically once a
                    merchant shows a steady weekly, monthly, or yearly pattern.
                  </p>
                </div>
              )}

              {/* Recurring card credits not tied to a specific charge */}
              {credits.length > 0 && (
                <div className="border-t border-midnight-700 px-4 md:px-6 py-3">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
                    Recurring card credits (not tied to one subscription)
                  </p>
                  <div className="space-y-1.5">
                    {credits.map(credit => (
                      <div key={credit.merchant} className="flex items-center justify-between text-sm">
                        <span className="text-slate-300 truncate">{credit.merchant}</span>
                        <span className="text-emerald-400 font-medium flex-shrink-0">
                          +{formatCurrency(credit.monthly_amount)}/mo
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Annual card fees vs perks */}
              {cards.length > 0 && (
                <div className="border-t border-midnight-700 px-4 md:px-6 py-3">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" />
                    Card fees vs rewards (last 12 months)
                  </p>
                  <div className="space-y-2">
                    {cards.map(card => (
                      <div key={card.account_name} className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <span className="text-slate-200 truncate">{card.account_name}</span>
                          <p className="text-xs text-slate-500">
                            {formatCurrency(card.fee_annual)} fee · {formatCurrency(card.credits_12mo)} in credits
                          </p>
                        </div>
                        <span
                          className={clsx(
                            'flex-shrink-0 text-xs font-semibold rounded-full px-2.5 py-1',
                            card.covered
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-rose-500/10 text-rose-400'
                          )}
                        >
                          {card.covered
                            ? `Fee covered, +${formatCurrency(Math.abs(card.net_annual))}/yr ahead`
                            : `Costs you ${formatCurrency(card.net_annual)}/yr`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
};
