import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types';

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  username: string;
  phone: string;
}

export interface SignUpResult {
  error: string | null;
  needsVerification: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  availableRoles: UserRole[];
  loading: boolean;
  sessionExpired: boolean;
  suspended: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  resendVerification: (email: string) => Promise<{ error: string | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearSessionExpired: () => void;
  switchActiveRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toAuthMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'An account with this email already exists.';
  }
  if (lower.includes('email not confirmed')) return 'Please verify your email before signing in.';
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Network error. Check your connection and try again.';
  }
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [secondaryRole, setSecondaryRole] = useState<UserRole | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const signingOutRef = useRef(false);
  const hadUserRef = useRef(false);

  const loadProfile = useCallback(async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setProfile(profileData as Profile | null);

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, secondary_role')
      .eq('user_id', userId)
      .maybeSingle();
    const typed = roleData as { role: UserRole; secondary_role: UserRole | null } | null;
    setRole(typed?.role ?? null);
    setSecondaryRole(typed?.secondary_role ?? null);
    setActiveRole((current) => current ?? typed?.role ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      hadUserRef.current = Boolean(s?.user);
      if (s?.user) {
        loadProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        hadUserRef.current = true;
        (async () => {
          await loadProfile(s.user.id);
          setLoading(false);
        })();
      } else {
        if (event === 'SIGNED_OUT' && hadUserRef.current && !signingOutRef.current) {
          setSessionExpired(true);
        }
        hadUserRef.current = false;
        setProfile(null);
        setRole(null);
        setSecondaryRole(null);
        setActiveRole(null);
        setLoading(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    setSessionExpired(false);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { error: toAuthMessage(error.message) };
    const { data: profileData } = await supabase
      .from('profiles')
      .select('account_status, deactivated_at')
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .maybeSingle();
    const status = (profileData as { account_status: string } | null)?.account_status;
    if (status === 'suspended') {
      await supabase.auth.signOut();
      return { error: 'Your account has been suspended. Contact support if you believe this is a mistake.' };
    }
    const { error: reactivateError } = await supabase.rpc('reactivate_my_account');
    if (reactivateError) {
      await supabase.auth.signOut();
      return { error: 'We could not sign you in. Please try again.' };
    }
    return { error: null };
  }, []);

  const signUp = useCallback(async (input: SignUpInput): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: {
          display_name: input.fullName.trim(),
          username: input.username.trim().toLowerCase(),
          phone: input.phone.trim(),
          terms_accepted: 'true',
        },
        emailRedirectTo: `${window.location.origin}/#/onboarding`,
      },
    });
    if (error) return { error: toAuthMessage(error.message), needsVerification: false };
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return { error: 'An account with this email already exists.', needsVerification: false };
    }
    return { error: null, needsVerification: !data.session };
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/#/onboarding` },
    });
    return { error: error ? toAuthMessage(error.message) : null };
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/#/reset-password`,
    });
    return { error: error ? toAuthMessage(error.message) : null };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error ? toAuthMessage(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    signingOutRef.current = true;
    try {
      await supabase.auth.signOut();
    } finally {
      signingOutRef.current = false;
    }
    setProfile(null);
    setRole(null);
    setSecondaryRole(null);
    setActiveRole(null);
  }, []);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const availableRoles: UserRole[] = useMemo(() => {
    const list: UserRole[] = [];
    if (role) list.push(role);
    if (secondaryRole && secondaryRole !== role) list.push(secondaryRole);
    return list.length ? list : role ? [role] : [];
  }, [role, secondaryRole]);

  const switchActiveRole = useCallback((next: UserRole) => {
    if (next === role || next === secondaryRole) setActiveRole(next);
  }, [role, secondaryRole]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        role: activeRole ?? role,
        availableRoles,
        loading,
        sessionExpired,
        suspended: profile?.account_status === 'suspended',
        signIn,
        signUp,
        resendVerification,
        requestPasswordReset,
        updatePassword,
        signOut,
        refreshProfile,
        clearSessionExpired,
        switchActiveRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
