import { useState } from 'react';
import { Modal, Button, Input, Select } from '../ui';
import { useCreateManualAccount } from '../../hooks';

interface CreateManualAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const INSTITUTION_OPTIONS = [
  { value: '', label: 'Select institution' },
  { value: 'American Express', label: 'American Express' },
  { value: 'Chase', label: 'Chase' },
  { value: 'Bank of America', label: 'Bank of America' },
  { value: 'Wells Fargo', label: 'Wells Fargo' },
  { value: 'Capital One', label: 'Capital One' },
  { value: 'Discover', label: 'Discover' },
  { value: 'Citi', label: 'Citi' },
  { value: 'Fidelity', label: 'Fidelity' },
  { value: 'US Bank', label: 'US Bank' },
  { value: 'Other', label: 'Other' },
];

const ACCOUNT_TYPE_OPTIONS = [
  { value: '', label: 'Select account type' },
  { value: 'credit', label: 'Credit Card' },
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'investment', label: 'Investment (401k, IRA, Brokerage)' },
  { value: 'loan', label: 'Loan' },
  { value: 'other', label: 'Other' },
];

export const CreateManualAccountModal = ({ isOpen, onClose }: CreateManualAccountModalProps) => {
  const [institutionName, setInstitutionName] = useState('');
  const [customInstitution, setCustomInstitution] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('');
  const [balance, setBalance] = useState('');

  const createAccount = useCreateManualAccount();

  const finalInstitutionName = institutionName === 'Other' ? customInstitution : institutionName;
  const isValid = finalInstitutionName && accountName && accountType;

  const handleSubmit = async () => {
    if (!isValid) return;

    try {
      const data: Parameters<typeof createAccount.mutateAsync>[0] = {
        institution_name: finalInstitutionName,
        account_name: accountName,
        account_type: accountType,
      };
      if (balance) {
        data.current_balance = parseFloat(balance);
      }
      await createAccount.mutateAsync(data);
      handleClose();
    } catch (error) {
      console.error('Failed to create account:', error);
    }
  };

  const handleClose = () => {
    setInstitutionName('');
    setCustomInstitution('');
    setAccountName('');
    setAccountType('');
    setBalance('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Manual Account">
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          Create a manual account for banks that can't be linked automatically (e.g., American Express).
          You can import transactions via CSV after creating the account.
        </p>

        <Select
          label="Institution"
          value={institutionName}
          onChange={e => setInstitutionName(e.target.value)}
          options={INSTITUTION_OPTIONS}
        />

        {institutionName === 'Other' && (
          <Input
            label="Institution Name"
            value={customInstitution}
            onChange={e => setCustomInstitution(e.target.value)}
            placeholder="e.g., Local Credit Union"
          />
        )}

        <Input
          label="Account Name"
          value={accountName}
          onChange={e => setAccountName(e.target.value)}
          placeholder="e.g., Platinum Card, Checking"
        />

        <Select
          label="Account Type"
          value={accountType}
          onChange={e => setAccountType(e.target.value)}
          options={ACCOUNT_TYPE_OPTIONS}
        />

        <Input
          label="Current Balance (optional)"
          type="number"
          value={balance}
          onChange={e => setBalance(e.target.value)}
          placeholder="e.g., 15000"
        />

        <div className="flex flex-col-reverse md:flex-row gap-3 pt-4">
          <Button variant="secondary" onClick={handleClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={createAccount.isPending}
            disabled={!isValid}
            className="flex-1"
          >
            Create Account
          </Button>
        </div>
      </div>
    </Modal>
  );
};
