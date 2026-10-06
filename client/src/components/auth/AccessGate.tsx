import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { Button, Card, Input } from '../ui';
import { verifyAccessKey } from '../../services/api';
import { AUTH_REQUIRED_EVENT, getAccessKey } from '../../services/auth';

interface AccessGateProps {
  children: ReactNode;
}

// Blocks the app until the API access key is entered. The key is checked
// against the server, never baked into the client bundle.
export const AccessGate = ({ children }: AccessGateProps) => {
  const queryClient = useQueryClient();
  const [unlocked, setUnlocked] = useState(() => getAccessKey() !== null);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const lock = () => {
      queryClient.clear();
      setUnlocked(false);
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, lock);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, lock);
  }, [queryClient]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsChecking(true);
    setError(null);
    try {
      await verifyAccessKey(key.trim());
      setKey('');
      setUnlocked(true);
    } catch {
      setError('That access key was not accepted.');
    } finally {
      setIsChecking(false);
    }
  };

  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-screen bg-midnight-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 text-slate-100">
            <Lock className="h-5 w-5" aria-hidden="true" />
            <h1 className="text-lg font-semibold">BudgetFlow</h1>
          </div>
          <Input
            label="Access key"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={key}
            onChange={(e) => setKey(e.target.value)}
            error={error ?? undefined}
          />
          <Button type="submit" className="w-full" isLoading={isChecking} disabled={!key.trim()}>
            Unlock
          </Button>
        </form>
      </Card>
    </div>
  );
};
