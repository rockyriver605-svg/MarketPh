import { useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthLayout, FormAlert } from '@/components/auth/AuthLayout';
import { validateEmail } from '@/lib/validation';

export function SignInPage() {
  const { signIn, sessionExpired, clearSessionExpired } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    clearSessionExpired();

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }

    setLoading(true);
    const { error: errMsg } = await signIn(email, password);
    setLoading(false);
    if (errMsg) {
      setError(errMsg);
    } else {
      navigate('/');
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your MariMarket account">
      <form onSubmit={handleSubmit} className="space-y-4">
        {sessionExpired && (
          <FormAlert tone="info">Your session expired for security. Please sign in again.</FormAlert>
        )}
        <Input
          label="Email"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
        <div>
          <Input
            label="Password"
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            autoComplete="current-password"
          />
          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="text-xs font-medium text-brand-600 hover:text-brand-800 transition-colors"
            >
              Forgot password?
            </button>
          </div>
        </div>

        {error && <FormAlert tone="error">{error}</FormAlert>}

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Sign In
        </Button>
      </form>

      <p className="text-center text-sm text-brand-500 mt-6">
        Don't have an account?{' '}
        <button onClick={() => navigate('/signup')} className="text-brand-600 font-semibold hover:text-brand-800 transition-colors">
          Sign up
        </button>
      </p>
    </AuthLayout>
  );
}
