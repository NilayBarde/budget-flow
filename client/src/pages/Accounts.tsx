import { CreditCard } from 'lucide-react';
import { Card, Spinner, EmptyState } from '../components/ui';
import { AccountCard, PlaidLinkButton } from '../components/accounts';
import { useAccounts } from '../hooks';

export const Accounts = () => {
  const { data: accounts, isLoading } = useAccounts();

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - Stacked on mobile */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Accounts</h1>
          <p className="text-slate-400 mt-1">Manage your connected bank accounts</p>
        </div>
        <PlaidLinkButton />
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
              Securely connect your American Express, Discover, Capital One, Robinhood, Bilt, 
              and Venmo accounts to automatically import transactions.
            </p>
            <div className="mt-3 pt-3 border-t border-midnight-700">
              <p className="text-xs text-amber-400/80">
                <strong>Note:</strong> American Express has known integration issues with Plaid 
                (including INTERNAL_SERVER_ERROR affecting ~1% of connections). Amex accounts also 
                require frequent re-authentication (often daily) due to strict security protocols. 
                If you encounter connection errors, wait a few minutes and try reconnecting.
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
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No accounts connected"
          description="Connect your first bank account to start tracking your transactions automatically."
          icon={<CreditCard className="h-8 w-8 text-slate-400" />}
          action={<PlaidLinkButton />}
        />
      )}
    </div>
  );
};
