import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '../services/supabase';
import { configureApiAuth } from '../services/api';
import { PLAID_LINK_TOKEN_STORAGE_KEY } from '../utils/constants';
import { AuthContext } from './AuthContext';

const SESSION_ENDED = 'Your session ended. Sign in again.';

// The API is configured when this module loads, before anything renders: pages fetch from their own
// effects, which run before AuthProvider's, so their first requests must already carry the token.
// The mounted provider supplies what to do when the API rejects the session.
let handleAuthFailure: (status: 401 | 403, message: string) => void = () => {};
configureApiAuth({
  getAccessToken: async () => (await getSupabase().auth.getSession()).data.session?.access_token ?? null,
  onAuthFailure: (status, message) => handleAuthFailure(status, message),
});

/** Holds the Supabase session, signs requests with it, and signs out when the API rejects it. */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const signOut = useCallback(
    async (reason?: string) => {
      setNotice(reason ?? null);
      setSession(null);
      // Nothing of one user's may show for the next person on this browser
      queryClient.clear();
      try {
        localStorage.removeItem(PLAID_LINK_TOKEN_STORAGE_KEY);
      } catch {
        // Storage can be unavailable (private mode); there is nothing to clear then
      }
      try {
        await getSupabase().auth.signOut();
      } catch {
        // Already signed out locally above; a failed call to Supabase changes nothing for the user
      }
    },
    [queryClient],
  );

  useEffect(() => {
    handleAuthFailure = (status, message) => {
      void signOut(status === 403 ? message : SESSION_ENDED);
    };
    return () => {
      handleAuthFailure = () => {};
    };
  }, [signOut]);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setNotice(null);
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setNotice(error.message);
  }, []);

  const value = useMemo(
    () => ({ session, loading, notice, signInWithGoogle, signOut }),
    [session, loading, notice, signInWithGoogle, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
