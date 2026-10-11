import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import clsx from 'clsx';
import { RefreshCw, Trash2, Upload, History, MoreVertical, KeyRound, Users, Eye, EyeOff, Pencil, Unlink } from 'lucide-react';
import { Card, Button } from '../ui';
import type { Account } from '../../types';
import { formatDate } from '../../utils/formatters';
import { isDisconnectedAccount, isManualAccount } from '../../utils/account-types';
import { ReconnectNotice } from './ReconnectNotice';
import { SyncErrorNotice } from './SyncErrorNotice';
import { useSyncAccount, useDeleteAccount, useDisconnectAccount, useRefreshAccounts, useCreatePlaidUpdateLinkToken, useToggleAccountInvestmentExclusion } from '../../hooks';


// Wrapper component for Plaid Link update mode - only renders when we have a token
interface PlaidLinkUpdateProps {
  token: string;
  onSuccess: () => void;
  onExit: (err: { error_code?: string; error_message?: string } | null) => void;
  institutionName: string;
}

const PlaidLinkUpdate = ({ token, onSuccess, onExit, institutionName }: PlaidLinkUpdateProps) => {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (ready) {
      console.log('Opening Plaid Link update mode for', institutionName);
      open();
    }
  }, [ready, open, institutionName]);

  return null; // This component doesn't render anything visible
};

// Marks an account that was disconnected from Plaid (Disconnect, keeps history)
const DisconnectedPill = () => (
  <span
    className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30 flex-shrink-0"
    title="Disconnected from Plaid. Its transaction history is kept; add new activity with CSV imports."
  >
    <Unlink className="h-3 w-3" />
    Disconnected
  </span>
);

interface RemoveMenuItemsProps {
  isManual: boolean;
  onDisconnect: () => void;
  onDelete: () => void;
  disconnectPending: boolean;
  deletePending: boolean;
}

// The bottom of the account menu, shared by the mobile and desktop layouts
const RemoveMenuItems = ({ isManual, onDisconnect, onDelete, disconnectPending, deletePending }: RemoveMenuItemsProps) => (
  <>
    {!isManual && (
      <button
        onClick={onDisconnect}
        disabled={disconnectPending}
        className="w-full px-3 py-2 text-left text-sm text-amber-400 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
      >
        <Unlink className="h-4 w-4" />
        Disconnect
        <span className="text-xs text-slate-500 ml-auto">Keeps history</span>
      </button>
    )}
    <button
      onClick={onDelete}
      disabled={deletePending}
      className="w-full px-3 py-2 text-left text-sm text-rose-400 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
      Delete Account
    </button>
  </>
);

interface AccountCardProps {
  account: Account;
  /** Every account on this account's bank connection, itself included */
  connectionAccountNames: string[];
  onImportCsv?: (account: Account) => void;
  onViewHistory?: (account: Account) => void;
  onEdit?: (account: Account) => void;
}

// Check if account is a credit card type
const isCreditCardAccount = (accountType: string): boolean => {
  const type = accountType.toLowerCase();
  return type.includes('credit') || type === 'credit card';
};

// Check if account is an investment type
const isInvestmentAccount = (accountType: string): boolean => {
  const type = accountType.toLowerCase();
  return ['investment', 'brokerage', '401k', 'ira', 'roth', 'hsa'].some(t => type.includes(t));
};

// Only use OAuth redirect URI on HTTPS
const getOAuthRedirectUri = () => {
  if (typeof window === 'undefined') return;
  if (import.meta.env.VITE_OAUTH_REDIRECT_URI) {
    return import.meta.env.VITE_OAUTH_REDIRECT_URI;
  }
  if (window.location.protocol === 'https:') {
    return `${window.location.origin}/oauth-callback`;
  }
  return;
};

export const AccountCard = ({ account, connectionAccountNames, onImportCsv, onViewHistory, onEdit }: AccountCardProps) => {
  const syncAccount = useSyncAccount();
  const deleteAccount = useDeleteAccount();
  const disconnectAccount = useDisconnectAccount();
  const refreshAccounts = useRefreshAccounts();
  const createUpdateLinkToken = useCreatePlaidUpdateLinkToken();
  const toggleExclusion = useToggleAccountInvestmentExclusion();
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [updateLinkToken, setUpdateLinkToken] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);

  const isManual = isManualAccount(account);
  const isDisconnected = isDisconnectedAccount(account);
  // A manual account with no imports is a warning, unless it was disconnected from Plaid with its history kept
  const importStatus = [
    isDisconnected && 'History kept',
    account.last_csv_import_at && `Last imported: ${formatDate(account.last_csv_import_at)}`,
  ].filter(Boolean).join(' · ') || 'No imports yet';
  const importStatusWarns = importStatus === 'No imports yet';
  const isCreditCard = isCreditCardAccount(account.account_type);
  const isInvestment = isInvestmentAccount(account.account_type);

  const oAuthRedirectUri = useMemo(() => getOAuthRedirectUri(), []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsideMobile = !mobileMenuRef.current?.contains(target);
      const isOutsideDesktop = !desktopMenuRef.current?.contains(target);
      if (isOutsideMobile && isOutsideDesktop) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSync = useCallback(() => {
    setUpdateError(null);
    // Show why a sync failed (for example "This connection needs to be reconnected")
    // instead of the spinner just stopping.
    syncAccount.mutate(account.id, { onError: (error) => setUpdateError(error.message) });
  }, [syncAccount, account.id]);

  const handleDelete = useCallback(() => {
    const history = isManual ? '' : ' and all of its transaction history (use Disconnect to keep the history)';
    if (confirm(`Delete ${account.institution_name} ${account.account_name}${history}? This can't be undone.`)) {
      deleteAccount.mutate(account.id);
    }
  }, [deleteAccount, isManual, account.institution_name, account.account_name, account.id]);

  // Plaid bills, and keeps syncing, the whole bank connection, so Disconnect takes all of its accounts
  const handleDisconnect = useCallback(() => {
    const scope = connectionAccountNames.length > 1
      ? `This disconnects the whole ${account.institution_name} connection: ${connectionAccountNames.join(', ')}.`
      : `This disconnects ${account.institution_name} ${account.account_name}.`;
    const message = `${scope}\n\n`
      + 'Transaction history is kept. Each account becomes a manual account: edit the balance by hand and add new activity with CSV imports. '
      + 'Plaid stops billing the connection. Linking the bank again later reconnects these accounts.';
    if (!confirm(message)) return;
    disconnectAccount.mutate(account.id, {
      onSuccess: result => {
        setRefreshResult(`Disconnected from Plaid, history kept: ${result.disconnected.join(', ')}`);
        setTimeout(() => setRefreshResult(null), 8000);
      },
      onError: error => {
        setUpdateError(error.message);
        setTimeout(() => setUpdateError(null), 8000);
      },
    });
  }, [disconnectAccount, connectionAccountNames, account.institution_name, account.account_name, account.id]);

  const handleImportCsv = useCallback(() => {
    onImportCsv?.(account);
  }, [onImportCsv, account]);


  const handleViewHistory = useCallback(() => {
    onViewHistory?.(account);
  }, [onViewHistory, account]);

  const handleEdit = useCallback(() => {
    onEdit?.(account);
  }, [onEdit, account]);



  const handleRefreshAccounts = useCallback(async () => {
    try {
      const result = await refreshAccounts.mutateAsync(account.id);
      if (result.total_new > 0) {
        setRefreshResult(`Added ${result.total_new} new account(s): ${result.created.map(a => a.name).join(', ')}`);
      } else if (result.total_updated > 0) {
        setRefreshResult(`Updated ${result.total_updated} account(s)`);
      } else {
        setRefreshResult('All accounts already synced');
      }
      // Clear message after 5 seconds
      setTimeout(() => setRefreshResult(null), 5000);
    } catch (error) {
      console.error('Failed to refresh accounts:', error);
      setRefreshResult('Failed to refresh accounts');
      setTimeout(() => setRefreshResult(null), 5000);
    }
  }, [refreshAccounts, account.id]);

  const handleToggleExclusion = useCallback(() => {
    toggleExclusion.mutate({
      accountId: account.id,
      excludeFromInvestments: !account.exclude_from_investments,
      exclusionNote: !account.exclude_from_investments ? 'User hidden' : undefined,
    });
  }, [toggleExclusion, account.id, account.exclude_from_investments]);

  // Update connection flow - get link token and open Plaid Link
  const handleUpdateConnection = useCallback(async () => {
    try {
      setUpdateError(null);
      const result = await createUpdateLinkToken.mutateAsync({
        accountId: account.id,
        redirectUri: oAuthRedirectUri,
      });
      setUpdateLinkToken(result.link_token);
    } catch (error) {
      console.error('Failed to create update link token:', error);
      setUpdateError('Failed to initiate update. Please try again.');
    }
  }, [createUpdateLinkToken, account.id, oAuthRedirectUri]);

  // Plaid Link success handler for update mode
  const onUpdateSuccess = useCallback(async () => {
    console.log('Plaid Link update completed successfully for', account.institution_name);
    setUpdateLinkToken(null);
    // needs_reauth only clears on the next successful sync, so run one now
    // instead of leaving the reconnect warning up until a manual sync.
    setRefreshResult('Connection updated! Syncing...');
    syncAccount.mutate(account.id, {
      onSuccess: () => {
        setRefreshResult('Connection updated and synced!');
        setTimeout(() => setRefreshResult(null), 5000);
      },
      onError: () => {
        setRefreshResult('Connection updated, but the sync failed. Try Sync manually.');
        setTimeout(() => setRefreshResult(null), 8000);
      },
    });
  }, [account.institution_name, account.id, syncAccount]);

  // Plaid Link exit handler
  const onUpdateExit = useCallback((err: { error_code?: string; error_message?: string } | null) => {
    console.log('Plaid Link update exited for', account.institution_name, err);
    setUpdateLinkToken(null);
    if (err?.error_code) {
      setUpdateError(`Update cancelled: ${err.error_message || err.error_code}`);
      setTimeout(() => setUpdateError(null), 5000);
    }
  }, [account.institution_name]);

  // Handler to initiate update connection
  const handleOpenUpdateLink = useCallback(() => {
    handleUpdateConnection();
  }, [handleUpdateConnection]);

  // Get institution icon/color
  const getInstitutionColor = (name: string): string => {
    const colors: Record<string, string> = {
      'american express': '#006FCF',
      'amex': '#006FCF',
      'discover': '#FF6000',
      'capital one': '#D03027',
      'robinhood': '#00C805',
      'bilt': '#000000',
      'venmo': '#3D95CE',
    };

    const normalizedName = name.toLowerCase();
    for (const [key, color] of Object.entries(colors)) {
      if (normalizedName.includes(key)) return color;
    }
    return '#6366f1';
  };

  const institutionColor = getInstitutionColor(account.institution_name);

  // Balance display component
  const BalanceDisplay = () => {
    if (isManual || !isCreditCard) return null;

    return (
      <div className="flex items-center gap-2">

      </div>
    );
  };

  // Toggle menu
  const toggleMenu = useCallback(() => {
    setShowMenu(prev => !prev);
  }, []);

  // Menu item click handler that closes the menu
  const handleMenuAction = useCallback((action: () => void) => {
    setShowMenu(false);
    action();
  }, []);

  return (
    <>
      {/* Plaid Link Update Mode - only renders when we have a token */}
      {updateLinkToken && (
        <PlaidLinkUpdate
          token={updateLinkToken}
          onSuccess={onUpdateSuccess}
          onExit={onUpdateExit}
          institutionName={account.institution_name}
        />
      )}

      <Card
        className={clsx(
          'transition-colors',
          isDisconnected ? 'border-dashed border-amber-500/50! hover:border-amber-500/70!' : 'hover:border-midnight-500',
        )}
        padding="sm"
      >
        {/* The bank login expired: offer the reconnect flow right on the card */}
        {account.needs_reauth && !isManual && (
          <ReconnectNotice onReconnect={handleOpenUpdateLink} isLoading={createUpdateLinkToken.isPending} />
        )}

        {/* The last sync failed for another reason: show it. Reconnect covers the expired login. */}
        {account.last_sync_error && !account.needs_reauth && !isManual && (
          <SyncErrorNotice message={account.last_sync_error} failedAt={account.last_sync_error_at} />
        )}

        {/* Refresh accounts result message */}
        {refreshResult && (
          <div className="mb-3 p-2 bg-accent-500/10 border border-accent-500/30 rounded-lg text-sm text-accent-400">
            {refreshResult}
          </div>
        )}

        {/* Mobile Layout */}
        <div className="md:hidden">
          <div className="flex items-start gap-3">
            <div
              className={clsx(
                'w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0',
                isDisconnected && 'opacity-50 grayscale',
              )}
              style={{ backgroundColor: institutionColor }}
            >
              {account.institution_name.charAt(0).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="font-semibold text-slate-100 truncate">{account.institution_name}</h3>
                  {isDisconnected && <DisconnectedPill />}
                </div>
                <BalanceDisplay />
              </div>
              <p className="text-sm text-slate-400 truncate">
                {account.account_name} • {account.account_type}
                {account.exclude_from_investments && (
                  <span className="ml-2 text-xs text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    Excluded
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Connected {formatDate(account.created_at)}
              </p>
              {isManual && (
                <p className={clsx('text-xs mt-0.5', importStatusWarns ? 'text-amber-400' : 'text-slate-500')}>
                  {importStatus}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-3 pt-3 border-t border-midnight-700">
            {isManual ? (
              <>
                {isInvestment ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleEdit}
                    className="flex-1"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Update Balance
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleImportCsv}
                    className="flex-1"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import CSV
                  </Button>
                )}
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSync}
                isLoading={syncAccount.isPending}
                className="flex-1"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync
              </Button>
            )}

            {/* More actions dropdown (Unfied for both manual and Plaid) */}
            <div className="relative" ref={mobileMenuRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMenu}
                className="text-slate-400 hover:text-slate-200"
                title="More options"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-midnight-800 border border-midnight-600 rounded-lg shadow-xl z-50 py-1">
                  <button
                    onClick={() => handleMenuAction(handleEdit)}
                    className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2"
                  >
                    <Pencil className="h-4 w-4 text-slate-400" />
                    Edit Details
                  </button>

                  {!isManual && (
                    <>
                      <button
                        onClick={() => handleMenuAction(handleOpenUpdateLink)}
                        disabled={createUpdateLinkToken.isPending}
                        className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
                      >
                        <KeyRound className="h-4 w-4 text-accent-400" />
                        Update Connection
                      </button>
                      <button
                        onClick={() => handleMenuAction(handleRefreshAccounts)}
                        disabled={refreshAccounts.isPending}
                        className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
                      >
                        <Users className="h-4 w-4 text-slate-400" />
                        Find Missing Accounts
                      </button>
                    </>
                  )}

                  {isManual && !isInvestment && (
                    <button
                      onClick={() => handleMenuAction(handleViewHistory)}
                      className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2"
                    >
                      <History className="h-4 w-4 text-slate-400" />
                      Import History
                    </button>
                  )}

                  {isInvestment && (
                    <>
                      <div className="border-t border-midnight-600 my-1" />
                      <button
                        onClick={() => handleMenuAction(handleToggleExclusion)}
                        disabled={toggleExclusion.isPending}
                        className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
                      >
                        {account.exclude_from_investments ? (
                          <>
                            <Eye className="h-4 w-4 text-emerald-400" />
                            Include in Investments
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-4 w-4 text-amber-400" />
                            Exclude from Investments
                          </>
                        )}
                      </button>
                    </>
                  )}

                  <div className="border-t border-midnight-600 my-1" />
                  <RemoveMenuItems
                    isManual={isManual}
                    onDisconnect={() => handleMenuAction(handleDisconnect)}
                    onDelete={() => handleMenuAction(handleDelete)}
                    disconnectPending={disconnectAccount.isPending}
                    deletePending={deleteAccount.isPending}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden md:flex items-center gap-4">
          <div
            className={clsx(
              'w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold',
              isDisconnected && 'opacity-50 grayscale',
            )}
            style={{ backgroundColor: institutionColor }}
          >
            {account.institution_name.charAt(0).toUpperCase()}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-slate-100">{account.institution_name}</h3>
              {isDisconnected && <DisconnectedPill />}
              <BalanceDisplay />
            </div>
            <p className="text-sm text-slate-400">
              {account.account_name} • {account.account_type}
              {account.exclude_from_investments && (
                <span className="ml-2 text-xs text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  Excluded from Investments
                </span>
              )}
            </p>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-xs text-slate-500">
                Connected {formatDate(account.created_at)}
              </p>
              {isManual && (
                <span className={clsx('text-xs', importStatusWarns ? 'text-amber-400' : 'text-slate-500')}>
                  • {importStatus}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {isManual ? (
              <>
                {isInvestment ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleEdit}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Update Balance
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleImportCsv}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Import CSV
                  </Button>
                )}
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSync}
                isLoading={syncAccount.isPending}
                title="Sync transactions"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}

            {/* More actions dropdown (Unified) */}
            <div className="relative" ref={desktopMenuRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMenu}
                className="text-slate-400 hover:text-slate-200"
                title="More options"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-midnight-800 border border-midnight-600 rounded-lg shadow-xl z-50 py-1">
                  <button
                    onClick={() => handleMenuAction(handleEdit)}
                    className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2"
                  >
                    <Pencil className="h-4 w-4 text-slate-400" />
                    Edit Details
                  </button>

                  {!isManual && (
                    <>
                      <button
                        onClick={() => handleMenuAction(handleOpenUpdateLink)}
                        disabled={createUpdateLinkToken.isPending}
                        className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
                      >
                        <KeyRound className="h-4 w-4 text-accent-400" />
                        Update Connection
                      </button>
                      <button
                        onClick={() => handleMenuAction(handleRefreshAccounts)}
                        disabled={refreshAccounts.isPending}
                        className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
                      >
                        <Users className="h-4 w-4 text-slate-400" />
                        Find Missing Accounts
                      </button>
                    </>
                  )}

                  {isManual && !isInvestment && (
                    <button
                      onClick={() => handleMenuAction(handleViewHistory)}
                      className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2"
                    >
                      <History className="h-4 w-4 text-slate-400" />
                      Import History
                    </button>
                  )}

                  {isInvestment && (
                    <>
                      <div className="border-t border-midnight-600 my-1" />
                      <button
                        onClick={() => handleMenuAction(handleToggleExclusion)}
                        disabled={toggleExclusion.isPending}
                        className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
                      >
                        {account.exclude_from_investments ? (
                          <>
                            <Eye className="h-4 w-4 text-emerald-400" />
                            Include in Investments
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-4 w-4 text-amber-400" />
                            Exclude from Investments
                          </>
                        )}
                      </button>
                    </>
                  )}

                  <div className="border-t border-midnight-600 my-1" />
                  <RemoveMenuItems
                    isManual={isManual}
                    onDisconnect={() => handleMenuAction(handleDisconnect)}
                    onDelete={() => handleMenuAction(handleDelete)}
                    disconnectPending={disconnectAccount.isPending}
                    deletePending={deleteAccount.isPending}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Update error message */}
        {updateError && (
          <div className="mt-3 p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-sm text-rose-400">
            {updateError}
          </div>
        )}
      </Card>
    </>
  );
};
