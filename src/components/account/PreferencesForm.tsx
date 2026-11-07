import { useState, type FormEvent } from 'react';
import { Bell, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { ProfilePreferences } from '@/types';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { FormAlert } from '@/components/auth/AuthLayout';

function Toggle({ id, label, description, checked, onChange }: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-start justify-between gap-4 cursor-pointer">
      <span>
        <span className="block text-sm font-medium text-brand-900">{label}</span>
        <span className="block text-xs text-brand-500">{description}</span>
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-brand-300 text-brand-600 focus:ring-brand-500"
      />
    </label>
  );
}

export function PreferencesForm() {
  const { user, profile, refreshProfile } = useAuth();
  const initial: ProfilePreferences = profile?.preferences ?? {};
  const [emailNotifications, setEmailNotifications] = useState(initial.email_notifications ?? true);
  const [preferredContact, setPreferredContact] = useState<NonNullable<ProfilePreferences['preferred_contact']>>(initial.preferred_contact ?? 'message');
  const [showPhone, setShowPhone] = useState(initial.show_phone ?? false);
  const [showLocation, setShowLocation] = useState(initial.show_location ?? false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setResult(null);
    setSaving(true);
    const { data, error } = await supabase
      .from('profiles')
      .update({
        preferences: {
          ...initial,
          email_notifications: emailNotifications,
          preferred_contact: preferredContact,
          show_phone: showPhone,
          show_location: showLocation,
        },
      })
      .eq('id', user.id)
      .select('id');
    setSaving(false);
    if (error || !data || data.length === 0) {
      setResult({ tone: 'error', text: 'Your preferences could not be saved. Please try again.' });
      return;
    }
    await refreshProfile();
    setResult({ tone: 'success', text: 'Preferences saved.' });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-brand-500" />
          <h3 className="font-semibold text-brand-900">Notifications</h3>
        </div>
        <Toggle
          id="email-notifications"
          label="Email me about orders and messages"
          description="Receive updates about your orders and conversations by email."
          checked={emailNotifications}
          onChange={setEmailNotifications}
        />
        <Select label="Preferred way to be contacted" value={preferredContact} onChange={(e) => setPreferredContact(e.target.value as typeof preferredContact)}>
          <option value="message">In-app message</option>
          <option value="phone">Phone call</option>
          <option value="email">Email</option>
        </Select>
      </section>

      <section className="space-y-4 border-t border-brand-50 pt-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand-500" />
          <h3 className="font-semibold text-brand-900">Privacy</h3>
        </div>
        <p className="text-xs text-brand-500">Everything here is off by default. Turn a setting on only if you want that detail shown to other members.</p>
        <Toggle
          id="show-phone"
          label="Show my phone number on my public profile"
          description="Other members can see your contact number."
          checked={showPhone}
          onChange={setShowPhone}
        />
        <Toggle
          id="show-location"
          label="Show my municipality on my public profile"
          description="Other members can see the town you live in."
          checked={showLocation}
          onChange={setShowLocation}
        />
      </section>

      {result && <FormAlert tone={result.tone}>{result.text}</FormAlert>}
      <Button type="submit" loading={saving}>Save preferences</Button>
    </form>
  );
}
