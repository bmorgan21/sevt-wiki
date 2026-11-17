import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Session, Subteam } from '../types';
import { canEditSubteam, canInvite, canViewSubteam, isAdmin } from '../lib/permissions';

interface AuthValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.auth.getSession()
      .then(s => { if (alive) setSession(s); })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    const off = api.auth.onChange(s => {
      qc.clear(); // never let one user's cached data leak into the next session
      setSession(s);
      setLoading(false);
    });
    return () => { alive = false; off(); };
  }, [qc]);

  const value = useMemo<AuthValue>(() => ({
    session,
    loading,
    signIn: email => api.auth.signInWithEmail(email),
    verifyCode: (email, code) => api.auth.verifyEmailCode(email, code),
    signOut: () => api.auth.signOut(),
  }), [session, loading]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/** UI-side permission hints. The API remains the source of truth. */
export function usePermissions() {
  const { session } = useAuth();
  return useMemo(() => ({
    isAdmin: !!session && isAdmin(session.user),
    canInvite: !!session && canInvite(session.user, session.memberships),
    canView: (sub: Subteam) => !!session && canViewSubteam(session.user, session.memberships, sub),
    canEdit: (subteamId: string) => !!session && canEditSubteam(session.user, session.memberships, subteamId),
    roleIn: (subteamId: string) => session?.memberships[subteamId] ?? null,
  }), [session]);
}
