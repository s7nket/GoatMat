import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Member } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/**
 * 'checking' is deliberately distinct from 'denied'. A failed network call must
 * never be read as "this person has no access" -- that would lock a legitimate
 * user out of their own app on a weak signal.
 */
export type MemberStatus = 'idle' | 'checking' | 'ready' | 'denied' | 'error';

type AuthState = {
  session: Session | null;
  member: Member | null;
  memberStatus: MemberStatus;
  /** True until the stored session has been read from disk. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMember: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [memberStatus, setMemberStatus] = useState<MemberStatus>('idle');
  const [memberNonce, setMemberNonce] = useState(0);
  const [loading, setLoading] = useState(true);

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

  // The membership row is what RLS actually checks. Fetching it here means a
  // user who authenticates but is not active is caught at the door with a clear
  // message, instead of hitting empty screens everywhere.
  //
  // An inactive member cannot read even their own row -- is_member() is false,
  // so the select policy denies it and the result is an empty set, not an
  // error. That is why "no row" means denied but a thrown error does not.
  useEffect(() => {
    let active = true;
    if (!session) {
      setMember(null);
      setMemberStatus('idle');
      return;
    }

    setMemberStatus('checking');

    supabase
      .from('members')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setMember(null);
          setMemberStatus('error');
          return;
        }
        setMember(data ?? null);
        setMemberStatus(data ? 'ready' : 'denied');
      });

    return () => {
      active = false;
    };
  }, [session, memberNonce]);

  const refreshMember = useCallback(() => setMemberNonce((n) => n + 1), []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMember(null);
    setMemberStatus('idle');
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, member, memberStatus, loading, signIn, signOut, refreshMember }),
    [session, member, memberStatus, loading, signIn, signOut, refreshMember],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
