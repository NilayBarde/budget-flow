import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, Input, Spinner } from '../ui';
import { useCategories, useDeleteMerchantRule, useMerchantRules } from '../../hooks';
import { describeRule, searchMerchantRules } from '../../utils/merchant-rules';

const PAGE_SIZE = 50;

// The rules the app has learned from the user's corrections. A rule decides the category and type of every
// future transaction from its merchant, so a wrong one keeps causing the same mistake until it is deleted.
export const MerchantRules = () => {
  const { data: rules, isLoading, isError } = useMerchantRules();
  const { data: categories } = useCategories();
  const deleteRule = useDeleteMerchantRule();

  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const categoryNameById = useMemo(
    () => new Map((categories ?? []).map(category => [category.id, category.name])),
    [categories],
  );
  const matches = useMemo(
    () => searchMerchantRules(rules ?? [], query, categoryNameById),
    [rules, query, categoryNameById],
  );
  const shown = matches.slice(0, visible);
  const remaining = matches.length - shown.length;

  const confirmDelete = (id: string) => {
    setDeleteFailed(false);
    deleteRule.mutate(id, {
      onError: () => setDeleteFailed(true),
      onSettled: () => setConfirmingId(null),
    });
  };

  return (
    <Card padding="sm">
      <CardHeader
        title="Merchant rules"
        subtitle={rules ? `${rules.length} rule${rules.length === 1 ? '' : 's'} learned from your corrections` : 'Learned from your corrections'}
      />
      <p className="text-sm text-slate-400 mb-3">
        When you correct a transaction, the app remembers it for that merchant. Delete a rule that is wrong so
        it stops applying. Transactions already saved keep what they have; only future ones change.
      </p>

      {isLoading && (
        <div role="status" aria-label="Loading" className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {!isLoading && isError && (
        <p className="text-sm text-rose-400">Could not load your merchant rules. Try again later.</p>
      )}

      {!isLoading && !isError && rules && (
        <>
          {rules.length === 0 ? (
            <p className="text-sm text-slate-400">
              No rules yet. A rule appears when you change a transaction&apos;s category or type.
            </p>
          ) : (
            <div className="space-y-3">
              <Input
                type="search"
                aria-label="Search rules"
                placeholder="Search by merchant or category"
                value={query}
                onChange={event => {
                  setQuery(event.target.value);
                  setVisible(PAGE_SIZE);
                }}
              />

              {deleteFailed && (
                <p role="alert" className="text-sm text-rose-400">
                  Could not delete that rule. Try again.
                </p>
              )}

              {matches.length === 0 ? (
                <p className="text-sm text-slate-400">No rules match &ldquo;{query.trim()}&rdquo;.</p>
              ) : (
                <ul className="space-y-1.5">
                  {shown.map(rule => {
                    const description = describeRule(rule, categoryNameById);
                    const confirming = confirmingId === rule.id;

                    return (
                      <li
                        key={rule.id}
                        aria-label={rule.original_name}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-midnight-900 px-3 py-2.5 md:py-2"
                      >
                        <div className="min-w-0 flex-1 basis-40">
                          <p className="text-sm font-medium text-slate-200 truncate">{rule.original_name}</p>
                          {description.renamedTo && (
                            <p className="text-xs text-slate-500 truncate">shown as {description.renamedTo}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          {description.category && (
                            <span className="rounded-md bg-accent-500/15 px-2 py-0.5 text-accent-300">{description.category}</span>
                          )}
                          {description.type && (
                            <span className="rounded-md bg-midnight-700 px-2 py-0.5 text-slate-300">{description.type}</span>
                          )}
                          {description.decidesNothing && (
                            <span className="rounded-md bg-midnight-700 px-2 py-0.5 text-slate-400">Only renames</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {confirming ? (
                            <>
                              <Button
                                size="sm"
                                variant="danger"
                                aria-label="Confirm delete"
                                disabled={deleteRule.isPending}
                                onClick={() => confirmDelete(rule.id)}
                              >
                                Delete
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-midnight-700 hover:text-rose-400"
                              aria-label={`Delete rule for ${rule.original_name}`}
                              onClick={() => {
                                setDeleteFailed(false);
                                setConfirmingId(rule.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {remaining > 0 && (
                <Button variant="secondary" size="sm" onClick={() => setVisible(count => count + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, remaining)} more
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
};
