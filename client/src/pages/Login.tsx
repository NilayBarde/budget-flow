import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { PiggyBank } from 'lucide-react';
import { Button, Card, Spinner } from '../components/ui';
import { useAuth } from '../hooks/useAuth';

export const Login = () => {
  const { session, loading, notice, signInWithGoogle } = useAuth();
  const location = useLocation();
  const [redirecting, setRedirecting] = useState(false);

  if (loading) return <Spinner className="py-12" />;
  if (session) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith('/') && !from.startsWith('//') ? from : '/'} replace />;
  }

  const handleSignIn = async () => {
    setRedirecting(true);
    await signInWithGoogle();
    // Normally the browser is already on its way to Google; this only runs if starting failed
    setRedirecting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-midnight-950 px-4">
      <Card padding="lg" className="w-full max-w-sm text-center space-y-6">
        <div className="flex flex-col items-center gap-3">
          <span className="p-3 bg-accent-500 rounded-xl">
            <PiggyBank className="h-6 w-6 text-white" />
          </span>
          <h1 className="text-2xl font-display font-bold text-slate-100">BudgetFlow</h1>
          <p className="text-sm text-slate-400">Sign in with the Google account you were invited with.</p>
        </div>

        {notice && (
          <p role="alert" className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            {notice}
          </p>
        )}

        <Button className="w-full" size="lg" onClick={handleSignIn} isLoading={redirecting}>
          Continue with Google
        </Button>
      </Card>
    </div>
  );
};
