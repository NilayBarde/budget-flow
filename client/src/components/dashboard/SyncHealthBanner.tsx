import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { useSyncHealth } from '../../hooks';
import type { SyncHealthAccount } from '../../types';

const formatWhen = (iso: string | null): string => {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
};

const accountLabel = (a: SyncHealthAccount) =>
  `${a.institution_name}${a.account_name ? ` · ${a.account_name}` : ''}`;

export const SyncHealthBanner = () => {
  const { data: health } = useSyncHealth();

  if (!health || health.healthy) return null;

  const needsReauth = health.needs_reauth ?? [];
  const stale = health.stale ?? [];
  if (needsReauth.length === 0 && stale.length === 0) return null;

  return (
    <div className="space-y-3">
      {needsReauth.length > 0 && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
            <div className="flex-1">
              <p className="font-semibold text-rose-200">
                {needsReauth.length} account{needsReauth.length > 1 ? 's need' : ' needs'} reconnecting
              </p>
              <p className="mt-0.5 text-sm text-rose-200/70">
                These stopped syncing and won't pick up new transactions until you reconnect them
                (OAuth banks like American Express require this periodically).
              </p>
              <ul className="mt-2 space-y-1 text-sm text-rose-100/90">
                {needsReauth.map(a => (
                  <li key={a.id} className="flex items-center justify-between gap-3">
                    <span>{accountLabel(a)}</span>
                    <span className="text-xs text-rose-200/60">flagged {formatWhen(a.reauth_detected_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Link
              to="/accounts"
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
                'bg-rose-500/20 text-rose-100 hover:bg-rose-500/30 transition-colors'
              )}
            >
              <RefreshCw className="h-4 w-4" />
              Reconnect
            </Link>
          </div>
        </div>
      )}

      {stale.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="flex-1">
              <p className="font-semibold text-amber-200">
                {stale.length} account{stale.length > 1 ? "s haven't" : " hasn't"} synced recently
              </p>
              <p className="mt-0.5 text-sm text-amber-200/70">
                No successful sync in over {health.staleDays} days. They may just be quiet, or might need a reconnect.
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-100/90">
                {stale.map(a => (
                  <li key={a.id} className="flex items-center justify-between gap-3">
                    <span>{accountLabel(a)}</span>
                    <span className="text-xs text-amber-200/60">last synced {formatWhen(a.last_synced_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Link
              to="/accounts"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-100 hover:bg-amber-500/30 transition-colors"
            >
              Review
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
