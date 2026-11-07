import { useState, type FormEvent } from 'react';
import { KeyRound, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormAlert } from '@/components/auth/AuthLayout';
import { validateEmail, validatePassword } from '@/lib/validation';

export function PasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setResult(null);
    const nextErrors = {
      password: validatePassword(password) ?? undefined,
      confirm: password !== confirm ? 'Passwords do not match.' : undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.password || nextErrors.confirm) return;

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setResult({ tone: 'error', text: 'Your password could not be changed. Sign in again and retry.' });
      return;
    }
    setPassword('');
    setConfirm('');
    setResult({ tone: 'success', text: 'Your password has been updated.' });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-brand-500" />
        <h3 className="font-semibold text-brand-900">Change password</h3>
      </div>
      <Input label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint="At least 8 characters with uppercase, lowercase, and a number." />
      <Input label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
      {result && <FormAlert tone={result.tone}>{result.text}</FormAlert>}
      <Button type="submit" variant="secondary" loading={saving}>Update password</Button>
    </form>
  );
}

export function EmailForm() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setResult(null);
    const message = validateEmail(email);
    setError(message);
    if (message) return;
    if (email.trim().toLowerCase() === user?.email?.toLowerCase()) {
      setError('This is already your email address.');
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ email: email.trim() });
    setSaving(false);
    if (updateError) {
      setResult({ tone: 'error', text: 'We could not start the email change. Check the address and try again.' });
      return;
    }
    setEmail('');
    setResult({ tone: 'success', text: 'We sent a confirmation link to your new email. Your address changes after you confirm it.' });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-brand-500" />
        <h3 className="font-semibold text-brand-900">Change email</h3>
      </div>
      <p className="text-sm text-brand-500">Current email: <span className="font-medium text-brand-800">{user?.email}</span></p>
      <Input label="New email address" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error ?? undefined} />
      {result && <FormAlert tone={result.tone}>{result.text}</FormAlert>}
      <Button type="submit" variant="secondary" loading={saving}>Send confirmation</Button>
    </form>
  );
}
