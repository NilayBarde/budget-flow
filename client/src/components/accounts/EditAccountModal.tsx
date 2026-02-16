
import { useEffect, useState } from 'react';
import { useUpdateAccount } from '../../hooks';
import { Modal, Button, Input, Select } from '../ui';
import type { Account } from '../../types';

interface EditAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    account: Account;
}

const ACCOUNT_TYPES = [
    { value: 'checking', label: 'Cash - Checking' },
    { value: 'savings', label: 'Cash - Savings' },
    { value: 'credit card', label: 'Credit Card' },
    { value: 'investment', label: 'Investment' },
    { value: 'brokerage', label: 'Investment - Brokerage' },
    { value: '401k', label: 'Investment - 401k' },
    { value: 'ira', label: 'Investment - IRA' },
    { value: 'loan', label: 'Loan' },
    { value: 'mortgage', label: 'Loan - Mortgage' },
    { value: 'other', label: 'Other' },
];

export const EditAccountModal = ({ isOpen, onClose, account }: EditAccountModalProps) => {
    const updateAccount = useUpdateAccount();
    const isManual = account.plaid_access_token === 'manual' || account.plaid_item_id.startsWith('manual-');
    const [name, setName] = useState(account.account_name);
    const [type, setType] = useState(account.account_type);
    const [balance, setBalance] = useState(account.current_balance?.toString() || '0');

    useEffect(() => {
        if (isOpen) {
            setName(account.account_name);
            setType(account.account_type);
            setBalance(account.current_balance?.toString() || '0');
        }
    }, [isOpen, account]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateAccount.mutate(
            {
                accountId: account.id,
                data: {
                    account_name: name,
                    account_type: type,
                    current_balance: isManual ? parseFloat(balance) : undefined,
                },
            },
            {
                onSuccess: () => {
                    onClose();
                },
            }
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Edit Account Details">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        Account Name
                    </label>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Chase Sapphire"
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                        Account Type
                    </label>
                    <div className="text-xs text-slate-500 mb-2">
                        Changing the type will move the account to the corresponding section.
                    </div>
                    <Select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        options={ACCOUNT_TYPES}
                    />
                </div>

                {isManual && (
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                            Current Balance
                        </label>
                        <div className="text-xs text-slate-500 mb-2">
                            Enter the current balance of this account.
                        </div>
                        <Input
                            type="number"
                            step="0.01"
                            value={balance}
                            onChange={(e) => setBalance(e.target.value)}
                            placeholder="0.00"
                            required
                        />
                    </div>
                )}

                <div className="flex justify-end gap-3 mt-6">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        isLoading={updateAccount.isPending}
                        disabled={!name || !type}
                    >
                        Save Changes
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
