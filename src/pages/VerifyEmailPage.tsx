import { useEffect, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { Button } from '@/components/ui/Button';
import { AuthLayout, FormAlert } from '@/components/auth/AuthLayout';
import { validateEmail } from '@/lib/validation';

const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyEmailPage({ email }: { email: string }) {
  const { resendVerification } = useAuth();
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const emailError = validateEmail(email);

  const handleResend = async () => {
    setNotice(null);
    setSending(true);
    const { error } = await resendVerification(email);
    setSending(false);
    if (error) {
      setNotice({ tone: 'error', text: error });
    } else {
      setNotice({ tone: 'success', text: 'A new verification link has been sent to your email.' });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    }
  };

  return (
    <AuthLayout title="Check your email" subtitle="We need to confirm it's really you">
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-50 text-accent-600">
          <MailCheck className="h-7 w-7" />
        </div>

        {emailError ? (
          <FormAlert tone="error">We could not find an email address to verify. Sign up again to receive a link.</FormAlert>
        ) : (
          <p className="text-sm text-brand-600">
            We sent a verification link to <span className="font-semibold text-brand-900 break-all">{email}</span>.
            Open it on this device to activate your account.
          </p>
        )}

        {notice && <FormAlert tone={notice.tone}>{notice.text}</FormAlert>}

        {!emailError && (
          <Button
            variant="outline"
            className="w-full"
            loading={sending}
            disabled={cooldown > 0}
            onClick={handleResend}
          >
            {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend verification email'}
          </Button>
        )}

        <button
          onClick={() => navigate('/signin')}
          className="text-sm font-semibold text-brand-600 hover:text-brand-800 transition-colors"
        >
          Already verified? Sign in
        </button>
      </div>
    </AuthLayout>
  );
}
