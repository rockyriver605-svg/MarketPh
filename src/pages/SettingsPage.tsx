import { useState } from 'react';
import { AlertTriangle, ArrowLeft, LogOut, Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FormAlert } from '@/components/auth/AuthLayout';
import { PasswordForm, EmailForm } from '@/components/account/AccountSecurityForms';
import { PreferencesForm } from '@/components/account/PreferencesForm';

type DangerAction = 'deactivate' | 'delete' | 'cancel-delete' | null;

export function SettingsPage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [action, setAction] = useState<DangerAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !profile) {
    return (
      <div className="container-app py-16 text-center">
        <Button onClick={() => navigate('/signin')}>Sign In</Button>
      </div>
    );
  }

  const runDangerAction = async () => {
    if (!action) return;
    setBusy(true);
    setError(null);
    if (action === 'deactivate') {
      const { error: rpcError } = await supabase.rpc('deactivate_my_account');
      if (rpcError) {
        setBusy(false);
        setError('Your account could not be deactivated. Please try again.');
        return;
      }
      await signOut();
      navigate('/signin');
      return;
    }
    const rpcName = action === 'delete' ? 'request_account_deletion' : 'cancel_account_deletion';
    const { error: rpcError } = await supabase.rpc(rpcName);
    setBusy(false);
    if (rpcError) {
      setError('We could not update your deletion request. Please try again.');
      return;
    }
    setAction(null);
    await refreshProfile();
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="container-app max-w-3xl py-8 animate-fade-in space-y-6">
      <button onClick={() => navigate('/profile')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </button>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Settings className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Account settings</h1>
          <p className="text-sm text-brand-500">Security, notifications, and privacy for {user.email}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm space-y-8">
        <PasswordForm />
        <div className="border-t border-brand-50 pt-8">
          <EmailForm />
        </div>
      </section>

      <section className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
        <PreferencesForm />
      </section>

      <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <h3 className="font-semibold text-brand-900">Danger zone</h3>
        </div>

        {error && <FormAlert tone="error">{error}</FormAlert>}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-900">Deactivate account</p>
            <p className="text-xs text-brand-500">Hides your account and signs you out. Signing back in restores it.</p>
          </div>
          <Button variant="outline" onClick={() => setAction('deactivate')} disabled={!!profile.deactivated_at}>
            {profile.deactivated_at ? 'Deactivated' : 'Deactivate'}
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-brand-50 pt-6">
          <div>
            <p className="text-sm font-medium text-brand-900">Request account deletion</p>
            <p className="text-xs text-brand-500">
              {profile.deletion_requested_at
                ? `Requested on ${new Date(profile.deletion_requested_at).toLocaleDateString('en-PH')}. Our team will process it. You can cancel any time before then.`
                : 'Our team will review and permanently delete your account and personal data.'}
            </p>
          </div>
          {profile.deletion_requested_at ? (
            <Button variant="outline" onClick={() => setAction('cancel-delete')}>Cancel request</Button>
          ) : (
            <Button variant="danger" onClick={() => setAction('delete')}>Request deletion</Button>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-brand-50 pt-6">
          <div>
            <p className="text-sm font-medium text-brand-900">Sign out</p>
            <p className="text-xs text-brand-500">End your session on this device.</p>
          </div>
          <Button variant="secondary" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </section>

      <Modal
        open={action !== null}
        onClose={() => setAction(null)}
        title={action === 'deactivate' ? 'Deactivate your account?' : action === 'delete' ? 'Request account deletion?' : 'Cancel deletion request?'}
        size="sm"
      >
        <p className="text-sm text-brand-600">
          {action === 'deactivate' && 'Your account will be hidden and you will be signed out. Signing in again reactivates it.'}
          {action === 'delete' && 'This starts the deletion process for your account and personal data. You can cancel the request until it is processed.'}
          {action === 'cancel-delete' && 'Your account will stay active and keep its data.'}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setAction(null)} disabled={busy}>Go back</Button>
          <Button variant={action === 'cancel-delete' ? 'primary' : 'danger'} onClick={runDangerAction} loading={busy}>Confirm</Button>
        </div>
      </Modal>
    </div>
  );
}
