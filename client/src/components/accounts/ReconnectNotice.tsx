import { Button } from '../ui';

interface ReconnectNoticeProps {
  onReconnect: () => void;
  /** True while the Plaid link token is being created, so the flow cannot be started twice. */
  isLoading?: boolean;
}

// Shown on an account the server has flagged (needs_reauth): the bank login expired, so nothing
// syncs until the user signs in again through Plaid Link.
export const ReconnectNotice = ({ onReconnect, isLoading = false }: ReconnectNoticeProps) => (
  <div
    role="alert"
    className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3"
  >
    <p className="text-sm text-rose-300">This bank login expired, so this account has stopped syncing.</p>
    <Button size="sm" onClick={onReconnect} isLoading={isLoading}>
      Reconnect
    </Button>
  </div>
);
