import { useState, useCallback, useMemo } from 'react';
import { CreditCard, Plus, Wallet, PiggyBank, Briefcase, Landmark } from 'lucide-react';
import { Card, Spinner, EmptyState, Button } from '../components/ui';
import { AccountCard, PlaidLinkButton, CreateManualAccountModal, CsvImportModal, ImportHistoryModal, EditAccountModal } from '../components/accounts';
import { useAccounts } from '../hooks';
import type { Account } from '../types';

export const Accounts = () => {
  const { data: accounts, isLoading } = useAccounts();
  const [showManualAccountModal, setShowManualAccountModal] = useState(false);
  const [csvImportAccount, setCsvImportAccount] = useState<Account | null>(null);
  const [historyAccount, setHistoryAccount] = useState<Account | null>(null);
  const [editAccount, setEditAccount] = useState<Account | null>(null);

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

  const handleEditAccount = useCallback((account: Account) => {
    setEditAccount(account);
  }, []);

  const handleCloseEditAccount = useCallback(() => {
    setEditAccount(null);
  }, []);

  // Group accounts by type
  const groupedAccounts = useMemo(() => {
    if (!accounts) return {};

    const groups: Record<string, Account[]> = {
      cash: [],
      credit: [],
      investment: [],
      loan: [],
      other: [],
    };

    accounts.forEach(account => {
      const type = account.account_type.toLowerCase();

      if (['checking', 'savings', 'money market', 'paypal', 'prepaid'].some(t => type.includes(t))) {
        groups.cash.push(account);
      } else if (['credit card', 'credit'].some(t => type.includes(t))) {
        groups.credit.push(account);
      } else if (['investment', 'brokerage', '401k', 'ira', 'roth', 'hsa', 'pension'].some(t => type.includes(t))) {
        groups.investment.push(account);
      } else if (['loan', 'mortgage', 'student', 'auto'].some(t => type.includes(t))) {
        groups.loan.push(account);
      } else {
        groups.other.push(account);
      }
    });

    return groups;
  }, [accounts]);

  const hasAnyAccounts = accounts && accounts.length > 0;

  const renderAccountGroup = (title: string, groupAccounts: Account[], icon: React.ReactNode) => {
    if (!groupAccounts || groupAccounts.length === 0) return null;

    return (
      <div className="mb-8 last:mb-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-midnight-800 rounded-lg text-slate-400">
            {icon}
          </div>
          <h2 className="text-lg font-semibold text-slate-200">{title}</h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-midnight-800 text-slate-500">
            {groupAccounts.length}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {groupAccounts.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              onImportCsv={handleImportCsv}
              onViewHistory={handleViewHistory}
              onEdit={handleEditAccount}
            />
          ))}
        </div>
      </div>
    );
  };

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
          </div>
        </div>
      </Card>

      {/* Accounts List */}
      {isLoading ? (
        <Spinner className="py-12" />
      ) : hasAnyAccounts ? (
        <div className="space-y-2">
          {renderAccountGroup('Cash & Banking', groupedAccounts.cash, <Wallet className="h-4 w-4" />)}
          {renderAccountGroup('Credit Cards', groupedAccounts.credit, <CreditCard className="h-4 w-4" />)}
          {renderAccountGroup('Investments', groupedAccounts.investment, <Briefcase className="h-4 w-4" />)}
          {renderAccountGroup('Loans & Liability', groupedAccounts.loan, <Landmark className="h-4 w-4" />)}
          {renderAccountGroup('Other Accounts', groupedAccounts.other, <PiggyBank className="h-4 w-4" />)}
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

      {editAccount && (
        <EditAccountModal
          isOpen={!!editAccount}
          onClose={handleCloseEditAccount}
          account={editAccount}
        />
      )}
    </div>
  );
};
