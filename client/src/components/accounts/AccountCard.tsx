import { RefreshCw, Trash2 } from 'lucide-react';
import { Card, Button } from '../ui';
import type { Account } from '../../types';
import { formatDate } from '../../utils/formatters';
import { useSyncAccount, useDeleteAccount } from '../../hooks';

interface AccountCardProps {
  account: Account;
}

export const AccountCard = ({ account }: AccountCardProps) => {
  const syncAccount = useSyncAccount();
  const deleteAccount = useDeleteAccount();

  const handleSync = () => {
    syncAccount.mutate(account.id);
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to disconnect ${account.institution_name}?`)) {
      deleteAccount.mutate(account.id);
    }
  };

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

  return (
    <Card className="hover:border-midnight-500 transition-colors">
      <div className="flex items-center gap-4">
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold"
          style={{ backgroundColor: institutionColor }}
        >
          {account.institution_name.charAt(0).toUpperCase()}
        </div>
        
        <div className="flex-1">
          <h3 className="font-semibold text-slate-100">{account.institution_name}</h3>
          <p className="text-sm text-slate-400">
            {account.account_name} • {account.account_type}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Connected {formatDate(account.created_at)}
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSync}
            isLoading={syncAccount.isPending}
          >
            <RefreshCw className="h-4 w-4" />
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
        </div>
      </div>
    </Card>
  );
};

