import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '../services/supabase';
import { configureApiAuth } from '../services/api';
import { PLAID_LINK_TOKEN_STORAGE_KEY } from '../utils/constants';
import { AuthContext } from './AuthContext';

const SESSION_ENDED = 'Your session ended. Sign in again.';

// The API is configured when this module loads, before anything renders: pages fetch from their own
// effects, which run before AuthProvider's, so their first requests must already carry the token.
// The token is kept from the latest session (Supabase reports refreshes too), so requests don't
// queue on Supabase's session lock. The mounted provider supplies what to do on a rejection.
let currentAccessToken: string | null = null;
let handleAuthFailure: (status: 401 | 403, message: string) => void = () => {};
configureApiAuth({
  getAccessToken: async () => currentAccessToken,
  onAuthFailure: (status, message) => handleAuthFailure(status, message),
});

/** A path on this site to return to after Google sign-in, or '/' */
const safeReturnPath = (path: string | undefined) => (path && path.startsWith('/') && !path.startsWith('//') ? path : '/');

/** Holds the Supabase session, signs requests with it, and signs out when the API rejects it. */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  // Missing VITE_SUPABASE_* settings: said on the login page instead of a blank screen
  const [setupError] = useState<string | null>(() => {
    try {
      getSupabase();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Sign-in is not configured';
    }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!setupError);
  const [notice, setNotice] = useState<string | null>(setupError);

  // Nothing of one user's may show for the next person on this browser: their cached API data and
  // any half-finished Plaid link.
  const clearUserData = useCallback(() => {
    queryClient.clear();
    try {
      localStorage.removeItem(PLAID_LINK_TOKEN_STORAGE_KEY);
    } catch {
      // Storage can be unavailable (private mode); there is nothing to clear then
    }
  }, [queryClient]);

  // Whose data is on screen. undefined until the stored session has been read.
  const shownUserId = useRef<string | null | undefined>(undefined);
  const applySession = useCallback(
    (next: Session | null) => {
      const nextUserId = next?.user.id ?? null;
      // Signed out or switched account, in this tab or another: drop the previous user's data
      if (shownUserId.current !== undefined && shownUserId.current !== nextUserId) clearUserData();
      shownUserId.current = nextUserId;
      currentAccessToken = next?.access_token ?? null;
      setSession(next);
      setLoading(false);
    },
    [clearUserData],
  );

  const signOut = useCallback(
    async (reason?: string) => {
      setNotice(reason ?? null);
      applySession(null);
      try {
        // 'local' clears this browser's session without a network call, so signing out can't
        // silently fail and leave a session that comes back on reload
        await getSupabase().auth.signOut({ scope: 'local' });
      } catch {
        // The session is already gone from the app above
      }
    },
    [applySession],
  );

  useEffect(() => {
    handleAuthFailure = (status, message) => {
      // Parallel requests fail together; the first one signs out and sets the message
      if (!shownUserId.current) return;
      void signOut(status === 403 ? message : SESSION_ENDED);
    };
    return () => {
      handleAuthFailure = () => {};
    };
  }, [signOut]);

  useEffect(() => {
    if (setupError) return;
    const supabase = getSupabase();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) applySession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => applySession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [applySession, setupError]);

  const signInWithGoogle = useCallback(async (returnTo?: string) => {
    setNotice(null);
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: 'google',
        // Back to the page they asked for (a Plaid OAuth return included), not just the home page
        options: { redirectTo: `${window.location.origin}${safeReturnPath(returnTo)}` },
      });
      if (error) {
        setNotice(error.message);
        return false;
      }
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not start Google sign-in');
      return false;
    }
  }, []);

  const value = useMemo(
    () => ({ session, loading, notice, signInWithGoogle, signOut }),
    [session, loading, notice, signInWithGoogle, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
