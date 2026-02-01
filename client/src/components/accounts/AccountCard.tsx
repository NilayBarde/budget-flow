import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { RefreshCw, Trash2, Upload, History, Bell, BellOff, MoreVertical, KeyRound, Users } from 'lucide-react';
import { Card, Button } from '../ui';
import type { Account } from '../../types';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { useSyncAccount, useDeleteAccount, useRefreshAccounts, useCreatePlaidUpdateLinkToken } from '../../hooks';
import { syncAllInvestmentHoldings } from '../../services/api';

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

interface AccountCardProps {
  account: Account;
  onImportCsv?: (account: Account) => void;
  onViewHistory?: (account: Account) => void;
  onSetBalanceAlert?: (account: Account) => void;
}

// Check if account is a manual (non-Plaid) account
const isManualAccount = (account: Account): boolean => 
  account.plaid_access_token === 'manual' || account.plaid_item_id.startsWith('manual-');

// Check if account is a credit card type
const isCreditCardAccount = (accountType: string): boolean => {
  const type = accountType.toLowerCase();
  return type.includes('credit') || type === 'credit card';
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

export const AccountCard = ({ account, onImportCsv, onViewHistory, onSetBalanceAlert }: AccountCardProps) => {
  const syncAccount = useSyncAccount();
  const deleteAccount = useDeleteAccount();
  const refreshAccounts = useRefreshAccounts();
  const createUpdateLinkToken = useCreatePlaidUpdateLinkToken();
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [updateLinkToken, setUpdateLinkToken] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);

  const isManual = isManualAccount(account);
  const isCreditCard = isCreditCardAccount(account.account_type);
  const hasBalance = account.current_balance !== null && account.current_balance !== undefined;
  const hasThreshold = account.balance_threshold !== null && account.balance_threshold !== undefined;
  const isOverThreshold = hasBalance && hasThreshold && account.current_balance! > account.balance_threshold!;
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
    syncAccount.mutate(account.id);
  }, [syncAccount, account.id]);

  const handleDelete = useCallback(() => {
    if (confirm(`Are you sure you want to disconnect ${account.institution_name}?`)) {
      deleteAccount.mutate(account.id);
    }
  }, [deleteAccount, account.institution_name, account.id]);

  const handleImportCsv = useCallback(() => {
    onImportCsv?.(account);
  }, [onImportCsv, account]);

  const handleViewHistory = useCallback(() => {
    onViewHistory?.(account);
  }, [onViewHistory, account]);

  const handleSetBalanceAlert = useCallback(() => {
    onSetBalanceAlert?.(account);
  }, [onSetBalanceAlert, account]);

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
    setRefreshResult('Connection updated! Syncing investment holdings...');
    try {
      // Sync investment holdings after successful update
      await syncAllInvestmentHoldings();
      setRefreshResult('Connection updated and holdings synced successfully!');
    } catch {
      setRefreshResult('Connection updated. Please sync investments manually.');
    }
    setTimeout(() => setRefreshResult(null), 5000);
  }, [account.institution_name]);

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
        {hasBalance && (
          <span className={`text-sm font-medium ${isOverThreshold ? 'text-amber-400' : 'text-slate-300'}`}>
            {formatCurrency(account.current_balance!)}
          </span>
        )}
        {hasThreshold && (
          <span 
            className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
              isOverThreshold 
                ? 'bg-amber-500/20 text-amber-400' 
                : 'bg-midnight-700 text-slate-400'
            }`}
            title={`Alert threshold: ${formatCurrency(account.balance_threshold!)}`}
          >
            <Bell className="h-3 w-3" />
          </span>
        )}
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
      
    <Card className="hover:border-midnight-500 transition-colors" padding="sm">
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
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0"
            style={{ backgroundColor: institutionColor }}
          >
            {account.institution_name.charAt(0).toUpperCase()}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-100 truncate">{account.institution_name}</h3>
              <BalanceDisplay />
            </div>
            <p className="text-sm text-slate-400 truncate">
              {account.account_name} • {account.account_type}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Connected {formatDate(account.created_at)}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2 mt-3 pt-3 border-t border-midnight-700">
          {isManual ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleImportCsv}
                className="flex-1"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleViewHistory}
                className="text-slate-400 hover:text-slate-200"
                title="Import History"
              >
                <History className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
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
              {/* More actions dropdown */}
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
                      onClick={() => handleMenuAction(handleOpenUpdateLink)}
                      disabled={createUpdateLinkToken.isPending}
                      className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
                    >
                      <KeyRound className="h-4 w-4 text-accent-400" />
                      Update Connection
                      <span className="text-xs text-slate-500 ml-auto">Investments</span>
                    </button>
                    <button
                      onClick={() => handleMenuAction(handleRefreshAccounts)}
                      disabled={refreshAccounts.isPending}
                      className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
                    >
                      <Users className="h-4 w-4 text-slate-400" />
                      Find Missing Accounts
                    </button>
                    {isCreditCard && (
                      <button
                        onClick={() => handleMenuAction(handleSetBalanceAlert)}
                        className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2"
                      >
                        {hasThreshold ? (
                          <Bell className="h-4 w-4 text-amber-400" />
                        ) : (
                          <BellOff className="h-4 w-4 text-slate-400" />
                        )}
                        {hasThreshold ? 'Edit Balance Alert' : 'Set Balance Alert'}
                      </button>
                    )}
                    <div className="border-t border-midnight-600 my-1" />
                    <button
                      onClick={() => handleMenuAction(handleDelete)}
                      disabled={deleteAccount.isPending}
                      className="w-full px-3 py-2 text-left text-sm text-rose-400 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Disconnect Account
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {isManual && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              isLoading={deleteAccount.isPending}
              className="text-slate-400 hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden md:flex items-center gap-4">
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold"
          style={{ backgroundColor: institutionColor }}
        >
          {account.institution_name.charAt(0).toUpperCase()}
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-slate-100">{account.institution_name}</h3>
            <BalanceDisplay />
          </div>
          <p className="text-sm text-slate-400">
            {account.account_name} • {account.account_type}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Connected {formatDate(account.created_at)}
          </p>
        </div>
        
        <div className="flex gap-2">
          {isManual ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleImportCsv}
              >
                <Upload className="h-4 w-4 mr-1" />
                Import CSV
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleViewHistory}
                className="text-slate-400 hover:text-slate-200"
                title="Import History"
              >
                <History className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                isLoading={deleteAccount.isPending}
                className="text-slate-400 hover:text-rose-400"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSync}
                isLoading={syncAccount.isPending}
                title="Sync transactions"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              {/* More actions dropdown */}
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
                      onClick={() => handleMenuAction(handleOpenUpdateLink)}
                      disabled={createUpdateLinkToken.isPending}
                      className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
                    >
                      <KeyRound className="h-4 w-4 text-accent-400" />
                      Update Connection
                      <span className="text-xs text-slate-500 ml-auto">Investments</span>
                    </button>
                    <button
                      onClick={() => handleMenuAction(handleRefreshAccounts)}
                      disabled={refreshAccounts.isPending}
                      className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
                    >
                      <Users className="h-4 w-4 text-slate-400" />
                      Find Missing Accounts
                    </button>
                    {isCreditCard && (
                      <button
                        onClick={() => handleMenuAction(handleSetBalanceAlert)}
                        className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-midnight-700 flex items-center gap-2"
                      >
                        {hasThreshold ? (
                          <Bell className="h-4 w-4 text-amber-400" />
                        ) : (
                          <BellOff className="h-4 w-4 text-slate-400" />
                        )}
                        {hasThreshold ? 'Edit Balance Alert' : 'Set Balance Alert'}
                      </button>
                    )}
                    <div className="border-t border-midnight-600 my-1" />
                    <button
                      onClick={() => handleMenuAction(handleDelete)}
                      disabled={deleteAccount.isPending}
                      className="w-full px-3 py-2 text-left text-sm text-rose-400 hover:bg-midnight-700 flex items-center gap-2 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Disconnect Account
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
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
