import { Unlink } from 'lucide-react';
import { formatDate } from '../../utils/formatters';

interface IdleConnectionNoticeProps {
  institutionName: string;
  /** Newest transaction on the connection (YYYY-MM-DD), or null if it never had one */
  lastActivity: string | null;
  onDisconnect: () => void;
  onKeep: () => void;
  busy?: boolean;
}

// Shown on the cards of a Plaid connection with no transactions in 60 days. Plaid bills every
// connection monthly whether or not it brings anything in, so suggest disconnecting it (history
// kept) or keeping it, which hides this for 90 days.
export const IdleConnectionNotice = ({ institutionName, lastActivity, onDisconnect, onKeep, busy = false }: IdleConnectionNoticeProps) => (
  // role=status, not alert, for the same reason as ReconnectNotice: on screen at page load, once per card.
  <div role="status" className="mb-3 rounded-lg border border-slate-500/30 bg-slate-500/10 p-3">
    <p className="text-sm text-slate-200">
      {lastActivity
        ? `No activity on this ${institutionName} connection since ${formatDate(lastActivity)}.`
        : `This ${institutionName} connection has had no transactions yet.`}
      {' '}Plaid still bills it monthly.
    </p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onDisconnect}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
      >
        <Unlink className="h-3.5 w-3.5" />
        Disconnect · keeps history
      </button>
      <button
        type="button"
        onClick={onKeep}
        disabled={busy}
        className="rounded-md border border-slate-500/40 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-500/10 disabled:opacity-50"
      >
        Keep
      </button>
    </div>
  </div>
);
