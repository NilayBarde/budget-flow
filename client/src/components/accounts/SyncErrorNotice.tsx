import { formatWhen } from '../../utils/format-when';

interface SyncErrorNoticeProps {
  /** The reason the server recorded for the failed sync. Rendered as text, never markup. */
  message: string;
  failedAt?: string | null;
}

// Shown on an account whose last sync failed for a reason other than an expired login (that case
// has ReconnectNotice). The next successful sync clears it.
export const SyncErrorNotice = ({ message, failedAt }: SyncErrorNoticeProps) => (
  // role=status, not alert, for the same reason as ReconnectNotice.
  <div role="status" className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
    <p className="text-sm text-amber-200">
      The last sync failed{failedAt ? ` (${formatWhen(failedAt)})` : ''}, so recent transactions may be missing.
    </p>
    <p className="mt-1 break-words text-xs text-amber-200/70">{message}</p>
  </div>
);
