import { useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthLayout, FormAlert } from '@/components/auth/AuthLayout';
import { validateEmail } from '@/lib/validation';

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setLoading(true);
    const { error: errMsg } = await requestPasswordReset(email);
    setLoading(false);
    if (errMsg) {
      setError(errMsg);
    } else {
      setSent(true);
    }
  };

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a secure link to choose a new password">
      {sent ? (
        <div className="space-y-4">
          <FormAlert tone="success">
            If an account exists for {email.trim()}, a password reset link is on its way. The link expires after a short time.
          </FormAlert>
          <Button variant="outline" className="w-full" onClick={() => navigate('/signin')}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Email"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            error={error ?? undefined}
          />
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Send reset link
          </Button>
          <p className="text-center text-sm text-brand-500">
            Remembered it?{' '}
            <button type="button" onClick={() => navigate('/signin')} className="text-brand-600 font-semibold hover:text-brand-800 transition-colors">
              Sign in
            </button>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
