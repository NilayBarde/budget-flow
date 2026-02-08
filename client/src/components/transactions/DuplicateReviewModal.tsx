import { useState, useCallback, useMemo } from 'react';
import { AlertTriangle, Trash2, Check, Copy } from 'lucide-react';
import { Modal, Button, Badge, Spinner } from '../ui';
import { useDuplicates, useBulkDeleteTransactions } from '../../hooks';
import { formatCurrency } from '../../utils/formatters';

interface DuplicateReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DuplicateReviewModal = ({ isOpen, onClose }: DuplicateReviewModalProps) => {
  const { data, isLoading } = useDuplicates(isOpen);
  const bulkDelete = useBulkDeleteTransactions();
  const [removedGroups, setRemovedGroups] = useState<Set<number>>(new Set());
  const [confirmAll, setConfirmAll] = useState(false);

  // Reset local state when modal opens
  const handleClose = useCallback(() => {
    setRemovedGroups(new Set());
    setConfirmAll(false);
    onClose();
  }, [onClose]);

  const groups = useMemo(() => data?.groups || [], [data]);
  const visibleGroups = useMemo(
    () => groups.filter((_, i) => !removedGroups.has(i)),
    [groups, removedGroups],
  );

  // For each group, auto-select the extras (keep the oldest, remove the newer ones)
  const getIdsToRemove = useCallback(
    (groupIndex: number) => {
      const group = groups[groupIndex];
      if (!group) return [];
      // Keep the first one (oldest by created_at), remove the rest
      const sorted = [...group.transactions].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      return sorted.slice(1).map(t => t.id);
    },
    [groups],
  );

  const handleRemoveGroup = useCallback(
    async (groupIndex: number) => {
      const ids = getIdsToRemove(groupIndex);
      if (ids.length === 0) return;
      await bulkDelete.mutateAsync(ids);
      setRemovedGroups(prev => new Set([...prev, groupIndex]));
    },
    [getIdsToRemove, bulkDelete],
  );

  const handleRemoveAll = useCallback(async () => {
    const allIds: string[] = [];
    groups.forEach((_, i) => {
      if (!removedGroups.has(i)) {
        allIds.push(...getIdsToRemove(i));
      }
    });
    if (allIds.length === 0) return;
    await bulkDelete.mutateAsync(allIds);
    setConfirmAll(false);
    // Mark all as removed
    setRemovedGroups(new Set(groups.map((_, i) => i)));
  }, [groups, removedGroups, getIdsToRemove, bulkDelete]);

  const totalDuplicates = useMemo(
    () => visibleGroups.reduce((sum, g) => sum + g.count - 1, 0),
    [visibleGroups],
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Duplicate Transactions" size="lg">
      {isLoading ? (
        <Spinner className="py-12" />
      ) : visibleGroups.length === 0 ? (
        <div className="py-12 text-center">
          <Check className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-slate-200 font-medium">No duplicates found</p>
          <p className="text-slate-400 text-sm mt-1">All your transactions look clean!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-sm text-amber-200 font-medium">
                  {visibleGroups.length} duplicate group{visibleGroups.length !== 1 ? 's' : ''} found
                </p>
                <p className="text-xs text-amber-400/80">
                  {totalDuplicates} extra transaction{totalDuplicates !== 1 ? 's' : ''} to remove
                </p>
              </div>
            </div>

            {!confirmAll ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmAll(true)}
                disabled={bulkDelete.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Remove All
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleRemoveAll}
                  isLoading={bulkDelete.isPending}
                >
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmAll(false)}
                  disabled={bulkDelete.isPending}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Groups */}
          <div className="space-y-3 max-h-[55vh] overflow-y-auto">
            {visibleGroups.map((group, visIdx) => {
              // Find the real index in original groups array
              const realIdx = groups.indexOf(group);
              const sorted = [...group.transactions].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              );
              const keeping = sorted[0];
              const removing = sorted.slice(1);

              return (
                <div
                  key={`${group.date}-${group.amount}-${group.merchant}-${visIdx}`}
                  className="bg-midnight-700/50 rounded-lg p-3 border border-midnight-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-100 truncate">
                          {group.merchant}
                        </span>
                        <Badge className="text-xs bg-amber-500/20 text-amber-400">
                          <Copy className="h-3 w-3 mr-0.5" />
                          {group.count}x
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(group.date + 'T00:00:00').toLocaleDateString()} · {formatCurrency(Math.abs(group.amount))} · {group.accountName}
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemoveGroup(realIdx)}
                      isLoading={bulkDelete.isPending}
                      className="flex-shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Remove {removing.length}
                    </Button>
                  </div>

                  {/* Show what we're keeping vs removing */}
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-14 text-emerald-400 font-medium flex-shrink-0">Keep</span>
                      <span className="text-slate-300 truncate">{keeping.merchant_display_name || keeping.merchant_name}</span>
                      <span className="text-slate-500 flex-shrink-0">
                        {new Date(keeping.created_at).toLocaleDateString()}
                      </span>
                      {keeping.import_id && (
                        <Badge className="text-[10px] bg-midnight-600 text-slate-400">CSV</Badge>
                      )}
                    </div>
                    {removing.map(t => (
                      <div key={t.id} className="flex items-center gap-2 text-xs">
                        <span className="w-14 text-rose-400 font-medium flex-shrink-0">Remove</span>
                        <span className="text-slate-400 truncate">{t.merchant_display_name || t.merchant_name}</span>
                        <span className="text-slate-500 flex-shrink-0">
                          {new Date(t.created_at).toLocaleDateString()}
                        </span>
                        {t.import_id && (
                          <Badge className="text-[10px] bg-midnight-600 text-slate-400">CSV</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
};
