import { useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthLayout, FormAlert } from '@/components/auth/AuthLayout';
import {
  getPasswordStrength,
  normalizePhone,
  normalizeUsername,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
  validateUsername,
} from '@/lib/validation';

type FieldErrors = Partial<Record<'fullName' | 'username' | 'email' | 'phone' | 'password' | 'confirmPassword' | 'terms', string>>;

const STRENGTH_COLORS = ['bg-red-400', 'bg-amber-400', 'bg-amber-500', 'bg-green-500', 'bg-green-600'];

export function SignUpPage() {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'error'>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = getPasswordStrength(password);

  const checkUsername = async (value: string) => {
    const formatError = validateUsername(value);
    if (formatError) {
      setUsernameStatus('idle');
      return formatError;
    }
    setUsernameStatus('checking');
    const { data, error } = await supabase.rpc('is_username_available', { p_username: normalizeUsername(value) });
    if (error || typeof data !== 'boolean') {
      setUsernameStatus('error');
      return 'Could not check this username. Try again.';
    }
    setUsernameStatus(data ? 'available' : 'taken');
    return data ? null : 'This username is already taken.';
  };

  const handleUsernameBlur = async () => {
    if (!username) return;
    const message = await checkUsername(username);
    setFieldErrors((prev) => ({ ...prev, username: message ?? undefined }));
  };

  const validateAll = (): FieldErrors => {
    const errors: FieldErrors = {};
    errors.fullName = validateFullName(fullName) ?? undefined;
    errors.username = validateUsername(username) ?? undefined;
    errors.email = validateEmail(email) ?? undefined;
    errors.phone = (phone.trim() ? validatePhone(phone) : 'Enter your phone number.') ?? undefined;
    errors.password = validatePassword(password) ?? undefined;
    if (!errors.password && password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    if (!acceptedTerms) errors.terms = 'You must accept the Terms and Privacy Policy to continue.';
    return errors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const errors = validateAll();
    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    const availabilityError = await checkUsername(username);
    if (availabilityError) {
      setLoading(false);
      setFieldErrors((prev) => ({ ...prev, username: availabilityError }));
      return;
    }

    const result = await signUp({
      email,
      password,
      fullName,
      username: normalizeUsername(username),
      phone: normalizePhone(phone),
    });
    setLoading(false);

    if (result.error) {
      setFormError(result.error);
      return;
    }
    if (result.needsVerification) {
      navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`);
    } else {
      navigate('/onboarding');
    }
  };

  const usernameHint =
    usernameStatus === 'checking'
      ? 'Checking availability...'
      : usernameStatus === 'available'
        ? 'Username is available.'
        : '3–30 characters: lowercase letters, numbers, and underscores only.';

  return (
    <AuthLayout title="Create your account" subtitle="Join the MariMarket community">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Full name"
          name="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Juan dela Cruz"
          autoComplete="name"
          error={fieldErrors.fullName}
        />
        <Input
          label="Username"
          name="username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setUsernameStatus('idle');
          }}
          onBlur={handleUsernameBlur}
          placeholder="juan_dela123"
          autoComplete="username"
          error={fieldErrors.username}
          hint={usernameHint}
        />
        <Input
          label="Email"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          error={fieldErrors.email}
        />
        <Input
          label="Phone number"
          type="tel"
          name="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="09XX XXX XXXX"
          autoComplete="tel"
          error={fieldErrors.phone}
          hint="Used for pickup and delivery coordination."
        />
        <div>
          <Input
            label="Password"
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            error={fieldErrors.password}
          />
          {password && (
            <div className="mt-2 flex items-center gap-2" aria-live="polite">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${strength.score > i ? STRENGTH_COLORS[Math.min(strength.score, 5) - 1] : 'bg-brand-100'}`}
                  />
                ))}
              </div>
              <span className="text-xs text-brand-600 w-12 text-right">{strength.label}</span>
            </div>
          )}
        </div>
        <Input
          label="Confirm password"
          type="password"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your password"
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
        />

        <div>
          <label className="flex items-start gap-2.5 text-sm text-brand-700 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-500"
            />
            <span>I agree to the MariMarket Terms and Privacy Policy.</span>
          </label>
          {fieldErrors.terms && <p className="mt-1 text-xs text-red-600">{fieldErrors.terms}</p>}
        </div>

        {formError && <FormAlert tone="error">{formError}</FormAlert>}

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Create Account
        </Button>
      </form>

      <p className="text-center text-sm text-brand-500 mt-6">
        Already have an account?{' '}
        <button onClick={() => navigate('/signin')} className="text-brand-600 font-semibold hover:text-brand-800 transition-colors">
          Sign in
        </button>
      </p>
    </AuthLayout>
  );
}
