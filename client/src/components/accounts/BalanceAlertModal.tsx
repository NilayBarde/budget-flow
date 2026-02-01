import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, RefreshCw } from 'lucide-react';
import { Modal, Button, Input } from '../ui';
import { useUpdateAccount, useRefreshBalance } from '../../hooks';
import { formatCurrency } from '../../utils/formatters';
import type { Account } from '../../types';

interface BalanceAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account;
}

export const BalanceAlertModal = ({ isOpen, onClose, account }: BalanceAlertModalProps) => {
  const [threshold, setThreshold] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);

  const updateAccount = useUpdateAccount();
  const refreshBalance = useRefreshBalance();

  // Initialize form state when modal opens or account changes
  useEffect(() => {
    if (isOpen) {
      const hasThreshold = account.balance_threshold !== null && account.balance_threshold !== undefined;
      setIsEnabled(hasThreshold);
      setThreshold(hasThreshold ? String(account.balance_threshold) : '');
    }
  }, [isOpen, account.balance_threshold]);

  const handleRefreshBalance = useCallback(() => {
    refreshBalance.mutate(account.id);
  }, [refreshBalance, account.id]);

  const handleSubmit = useCallback(async () => {
    const thresholdValue = isEnabled && threshold ? parseFloat(threshold) : null;
    
    try {
      await updateAccount.mutateAsync({
        accountId: account.id,
        data: { balance_threshold: thresholdValue },
      });
      onClose();
    } catch (error) {
      console.error('Failed to update balance alert:', error);
    }
  }, [isEnabled, threshold, updateAccount, account.id, onClose]);

  const handleClose = useCallback(() => {
    setThreshold('');
    setIsEnabled(false);
    onClose();
  }, [onClose]);

  const toggleEnabled = useCallback(() => {
    setIsEnabled(prev => !prev);
  }, []);

  const handleThresholdChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setThreshold(e.target.value);
  }, []);

  const currentBalance = account.current_balance;
  const hasBalance = currentBalance !== null && currentBalance !== undefined;
  const thresholdNum = threshold ? parseFloat(threshold) : 0;
  const isOverThreshold = hasBalance && isEnabled && thresholdNum > 0 && currentBalance > thresholdNum;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Balance Alert Settings" size="sm">
      <div className="space-y-5">
        {/* Current Balance Display */}
        <div className="bg-midnight-900 rounded-xl p-4 border border-midnight-600">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Current Balance</p>
              <p className="text-2xl font-bold text-slate-100 mt-1">
                {hasBalance ? formatCurrency(currentBalance) : '—'}
              </p>
              {!hasBalance && (
                <p className="text-xs text-slate-500 mt-1">
                  Balance not yet fetched from Plaid
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshBalance}
              isLoading={refreshBalance.isPending}
              title="Refresh balance from Plaid"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Alert Toggle */}
        <div 
          className="flex items-center justify-between p-4 bg-midnight-900 rounded-xl border border-midnight-600 cursor-pointer hover:border-midnight-500 transition-colors"
          onClick={toggleEnabled}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isEnabled ? 'bg-amber-500/20 text-amber-400' : 'bg-midnight-700 text-slate-400'}`}>
              {isEnabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            </div>
            <div>
              <p className="font-medium text-slate-100">Balance Alert</p>
              <p className="text-sm text-slate-400">
                {isEnabled ? 'Notifications enabled' : 'Notifications disabled'}
              </p>
            </div>
          </div>
          <div 
            className={`w-12 h-7 rounded-full p-1 transition-colors ${isEnabled ? 'bg-accent-500' : 'bg-midnight-600'}`}
          >
            <div 
              className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </div>
        </div>

        {/* Threshold Input */}
        {isEnabled && (
          <div className="space-y-2">
            <Input
              label="Alert Threshold"
              type="number"
              value={threshold}
              onChange={handleThresholdChange}
              placeholder="e.g., 1000"
              min="0"
              step="100"
            />
            <p className="text-xs text-slate-500">
              You'll receive a Pushover notification when your balance exceeds this amount.
            </p>
            
            {isOverThreshold && (
              <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
                <Bell className="h-4 w-4 flex-shrink-0" />
                <span>
                  Current balance ({formatCurrency(currentBalance)}) exceeds threshold
                </span>
              </div>
            )}
          </div>
        )}

        {/* Info Text */}
        <p className="text-xs text-slate-500">
          Alerts are sent via Pushover when your credit card balance goes above the threshold.
          There's a 24-hour cooldown between notifications to prevent spam.
        </p>

        {/* Actions */}
        <div className="flex flex-col-reverse md:flex-row gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={updateAccount.isPending}
            className="flex-1"
          >
            Save Settings
          </Button>
        </div>
      </div>
    </Modal>
  );
};
