import { useState, useCallback } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import { Card, Spinner, EmptyState, Button } from '../components/ui';
import { AccountCard, PlaidLinkButton, CreateManualAccountModal, CsvImportModal, ImportHistoryModal, BalanceAlertModal, HoldingsImportModal } from '../components/accounts';
import { useAccounts } from '../hooks';
import type { Account } from '../types';

export const Accounts = () => {
  const { data: accounts, isLoading } = useAccounts();
  const [showManualAccountModal, setShowManualAccountModal] = useState(false);
  const [csvImportAccount, setCsvImportAccount] = useState<Account | null>(null);
  const [historyAccount, setHistoryAccount] = useState<Account | null>(null);
  const [balanceAlertAccount, setBalanceAlertAccount] = useState<Account | null>(null);
  const [holdingsImportAccount, setHoldingsImportAccount] = useState<Account | null>(null);

  const handleOpenManualModal = useCallback(() => {
    setShowManualAccountModal(true);
  }, []);

  const handleCloseManualModal = useCallback(() => {
    setShowManualAccountModal(false);
  }, []);

  const handleImportCsv = useCallback((account: Account) => {
    setCsvImportAccount(account);
  }, []);

  const handleCloseCsvImport = useCallback(() => {
    setCsvImportAccount(null);
  }, []);

  const handleViewHistory = useCallback((account: Account) => {
    setHistoryAccount(account);
  }, []);

  const handleCloseHistory = useCallback(() => {
    setHistoryAccount(null);
  }, []);

  const handleSetBalanceAlert = useCallback((account: Account) => {
    setBalanceAlertAccount(account);
  }, []);

  const handleCloseBalanceAlert = useCallback(() => {
    setBalanceAlertAccount(null);
  }, []);

  const handleImportHoldings = useCallback((account: Account) => {
    setHoldingsImportAccount(account);
  }, []);

  const handleCloseHoldingsImport = useCallback(() => {
    setHoldingsImportAccount(null);
  }, []);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - Stacked on mobile */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Accounts</h1>
          <p className="text-slate-400 mt-1">Manage your connected bank accounts</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Button onClick={handleOpenManualModal} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Manual Account
          </Button>
          <PlaidLinkButton />
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-gradient-to-r from-accent-500/10 to-midnight-800 border-accent-500/30" padding="sm">
        <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
          <div className="p-2 md:p-3 bg-accent-500/20 rounded-xl w-fit">
            <CreditCard className="h-5 w-5 md:h-6 md:w-6 text-accent-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-100">Connect Your Banks</h3>
            <p className="text-sm text-slate-400 mt-1">
              Securely connect your accounts automatically, or add a manual account for banks 
              like American Express that have Plaid connectivity issues. Manual accounts support 
              CSV import from your bank statements.
            </p>
            <div className="mt-3 pt-3 border-t border-midnight-700">
              <p className="text-xs text-amber-400/80">
                <strong>Tip:</strong> If Plaid connection fails for American Express, use 
                "Add Manual Account" and import transactions via CSV from your AMEX statement downloads.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Accounts List */}
      {isLoading ? (
        <Spinner className="py-12" />
      ) : accounts && accounts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {accounts.map(account => (
            <AccountCard 
              key={account.id} 
              account={account} 
              onImportCsv={handleImportCsv}
              onImportHoldings={handleImportHoldings}
              onViewHistory={handleViewHistory}
              onSetBalanceAlert={handleSetBalanceAlert}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No accounts connected"
          description="Connect your first bank account to start tracking your transactions automatically, or add a manual account for CSV imports."
          icon={<CreditCard className="h-8 w-8 text-slate-400" />}
          action={
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Button onClick={handleOpenManualModal}>
                <Plus className="h-4 w-4 mr-2" />
                Add Manual
              </Button>
              <PlaidLinkButton />
            </div>
          }
        />
      )}

      {/* Modals */}
      <CreateManualAccountModal 
        isOpen={showManualAccountModal} 
        onClose={handleCloseManualModal} 
      />
      
      {csvImportAccount && (
        <CsvImportModal
          isOpen={!!csvImportAccount}
          onClose={handleCloseCsvImport}
          account={csvImportAccount}
        />
      )}

      {historyAccount && (
        <ImportHistoryModal
          isOpen={!!historyAccount}
          onClose={handleCloseHistory}
          account={historyAccount}
        />
      )}

      {balanceAlertAccount && (
        <BalanceAlertModal
          isOpen={!!balanceAlertAccount}
          onClose={handleCloseBalanceAlert}
          account={balanceAlertAccount}
        />
      )}

      {holdingsImportAccount && (
        <HoldingsImportModal
          isOpen={!!holdingsImportAccount}
          onClose={handleCloseHoldingsImport}
          account={holdingsImportAccount}
        />
      )}
    </div>
  );
};
