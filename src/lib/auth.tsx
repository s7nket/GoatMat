import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Profile } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/**
 * 'checking' is deliberately distinct from 'denied'. A failed network call must
 * never be read as "this person has no access" -- that would lock a legitimate
 * user out of their own app on a weak signal.
 */
export type ProfileStatus = 'idle' | 'checking' | 'ready' | 'denied' | 'error';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  profileStatus: ProfileStatus;
  /** True until the stored session has been read from disk. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Tagged with the user it belongs to. Signing in as someone else would
  // otherwise show the previous account's profile until the new one arrives.
  const [loaded, setLoaded] = useState<{
    userId: string;
    profile: Profile | null;
    status: Extract<ProfileStatus, 'ready' | 'denied' | 'error'>;
  } | null>(null);
  const [profileNonce, setProfileNonce] = useState(0);
  const [loading, setLoading] = useState(true);

  // Derived rather than stored, so there is no state to clear on sign-out and
  // no window where the two disagree.
  const fresh = session && loaded?.userId === session.user.id ? loaded : null;
  const profile = fresh?.profile ?? null;
  const profileStatus: ProfileStatus = !session ? 'idle' : (fresh?.status ?? 'checking');

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // The profile carries the business name and the active flag that RLS gates
  // every other table on. Loading it here means a user whose access has been
  // switched off is stopped at the door with a clear message, rather than
  // finding five empty screens and assuming the app is broken.
  //
  // A profile is readable by its owner regardless of `active`, so being turned
  // off is a value on the row and not an empty result -- which keeps it
  // distinct from a request that simply failed.
  useEffect(() => {
    if (!session) return;
    let running = true;

    supabase
      .from('profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!running) return;
        setLoaded({
          userId: session.user.id,
          profile: error ? null : (data ?? null),
          status: error ? 'error' : data && data.active ? 'ready' : 'denied',
        });
      });

    return () => {
      running = false;
    };
  }, [session, profileNonce]);

  const refreshProfile = useCallback(() => setProfileNonce((n) => n + 1), []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setLoaded(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, profile, profileStatus, loading, signIn, signOut, refreshProfile }),
    [session, profile, profileStatus, loading, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
