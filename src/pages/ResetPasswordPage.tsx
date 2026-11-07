import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthLayout, FormAlert } from '@/components/auth/AuthLayout';
import { getPasswordStrength, validatePassword } from '@/lib/validation';

type Status = 'checking' | 'ready' | 'invalid' | 'done';

export function ResetPasswordPage() {
  const { updatePassword, signOut } = useAuth();
  const [status, setStatus] = useState<Status>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setStatus('ready');
      else if (active) setStatus((current) => (current === 'checking' ? 'invalid' : current));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === 'PASSWORD_RECOVERY' && session) setStatus('ready');
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: errMsg } = await updatePassword(password);
    setLoading(false);
    if (errMsg) {
      setError(errMsg);
    } else {
      setStatus('done');
    }
  };

  const handleContinue = async () => {
    await signOut();
    navigate('/signin');
  };

  if (status === 'checking') {
    return (
      <AuthLayout title="Set a new password" subtitle="Checking your reset link...">
        <div className="h-24 rounded-lg bg-cream-100 animate-pulse" />
      </AuthLayout>
    );
  }

  if (status === 'invalid') {
    return (
      <AuthLayout title="Link expired" subtitle="This password reset link is invalid or has already been used">
        <div className="space-y-4">
          <FormAlert tone="error">Request a new reset link to continue.</FormAlert>
          <Button className="w-full" size="lg" onClick={() => navigate('/forgot-password')}>
            Request new link
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (status === 'done') {
    return (
      <AuthLayout title="Password updated" subtitle="Your account is secured with your new password">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <p className="text-sm text-brand-600">Sign in with your new password to continue.</p>
          <Button className="w-full" size="lg" onClick={handleContinue}>
            Continue to sign in
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a strong password you have not used before">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="flex items-center gap-2 text-brand-500 text-xs">
          <KeyRound className="h-4 w-4" /> Passwords need 8+ characters with upper, lower case, and a number.
        </div>
        <div>
          <Input
            label="New password"
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          {password && (
            <p className="mt-1.5 text-xs text-brand-600" aria-live="polite">Strength: {strength.label}</p>
          )}
        </div>
        <Input
          label="Confirm new password"
          type="password"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
        {error && <FormAlert tone="error">{error}</FormAlert>}
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
