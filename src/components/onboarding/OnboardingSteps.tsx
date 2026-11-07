import { useRef, type ChangeEvent } from 'react';
import { Camera, MapPin, Bell, User } from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FormAlert } from '@/components/auth/AuthLayout';
import type { Barangay, Municipality, ProfilePreferences } from '@/types';

export interface OnboardingForm {
  photoFile: File | null;
  photoPreview: string | null;
  fullName: string;
  username: string;
  phone: string;
  municipalityId: string;
  barangayId: string;
  emailNotifications: boolean;
  preferredContact: NonNullable<ProfilePreferences['preferred_contact']>;
}

export type OnboardingErrors = Partial<Record<keyof OnboardingForm, string>>;

interface StepProps {
  form: OnboardingForm;
  errors: OnboardingErrors;
  update: <K extends keyof OnboardingForm>(key: K, value: OnboardingForm[K]) => void;
}

export function PhotoStep({ form, update }: StepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = form.fullName.trim().charAt(0).toUpperCase() || 'M';

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      update('photoFile', null);
      update('photoPreview', null);
      return;
    }
    update('photoFile', file);
    update('photoPreview', URL.createObjectURL(file));
  };

  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div className="relative">
        {form.photoPreview ? (
          <img src={form.photoPreview} alt="Profile preview" className="h-28 w-28 rounded-full object-cover border-4 border-white shadow-md" />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-4xl font-bold border-4 border-white shadow-md">
            {initial}
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label="Choose profile photo"
          className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white shadow hover:bg-brand-700 transition-colors"
        >
          <Camera className="h-4 w-4" />
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
      <div>
        <h2 className="text-lg font-semibold text-brand-900">Add a profile photo</h2>
        <p className="text-sm text-brand-500 mt-1">JPEG, PNG, or WebP up to 2 MB. You can skip this and add one later.</p>
      </div>
      {form.photoFile && (
        <Button variant="ghost" size="sm" onClick={() => { update('photoFile', null); update('photoPreview', null); }}>
          Remove photo
        </Button>
      )}
    </div>
  );
}

export function DetailsStep({ form, errors, update }: StepProps) {
  return (
    <div className="space-y-4">
      <StepHeader icon={<User className="h-5 w-5" />} title="Your details" description="How buyers and sellers will know you." />
      <Input
        label="Full name"
        value={form.fullName}
        onChange={(e) => update('fullName', e.target.value)}
        error={errors.fullName}
        autoComplete="name"
      />
      <Input
        label="Username"
        value={form.username}
        onChange={(e) => update('username', e.target.value)}
        error={errors.username}
        hint="Lowercase letters, numbers, and underscores."
        autoComplete="username"
      />
      <Input
        label="Contact number"
        type="tel"
        value={form.phone}
        onChange={(e) => update('phone', e.target.value)}
        error={errors.phone}
        placeholder="09XX XXX XXXX"
        autoComplete="tel"
      />
    </div>
  );
}

interface LocationStepProps extends StepProps {
  municipalities: Municipality[];
  barangays: Barangay[];
  loadingLocations: boolean;
}

export function LocationStep({ form, errors, update, municipalities, barangays, loadingLocations }: LocationStepProps) {
  return (
    <div className="space-y-4">
      <StepHeader icon={<MapPin className="h-5 w-5" />} title="Where you are" description="Pick your municipality and barangay in Marinduque." />
      {loadingLocations ? (
        <div className="h-20 rounded-lg bg-cream-100 animate-pulse" />
      ) : municipalities.length === 0 ? (
        <FormAlert tone="info">Location options are not available yet. Try again later.</FormAlert>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          <Select
            label="Municipality"
            value={form.municipalityId}
            error={errors.municipalityId}
            onChange={(e) => {
              update('municipalityId', e.target.value);
              update('barangayId', '');
            }}
          >
            <option value="">Select municipality...</option>
            {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <Select
            label="Barangay"
            value={form.barangayId}
            error={errors.barangayId}
            disabled={!form.municipalityId}
            onChange={(e) => update('barangayId', e.target.value)}
          >
            <option value="">Select barangay...</option>
            {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
      )}
    </div>
  );
}

export function PreferencesStep({ form, update }: StepProps) {
  return (
    <div className="space-y-5">
      <StepHeader icon={<Bell className="h-5 w-5" />} title="Your preferences" description="You can change these anytime from your profile." />
      <label className="flex items-start gap-3 rounded-xl border border-brand-100 p-4 cursor-pointer hover:bg-brand-50/50 transition-colors">
        <input
          type="checkbox"
          checked={form.emailNotifications}
          onChange={(e) => update('emailNotifications', e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-500"
        />
        <span>
          <span className="block text-sm font-semibold text-brand-900">Email notifications</span>
          <span className="block text-xs text-brand-500 mt-0.5">Get email updates about orders, messages, and seller news.</span>
        </span>
      </label>
      <Select
        label="Preferred way to be contacted"
        value={form.preferredContact}
        onChange={(e) => update('preferredContact', e.target.value as OnboardingForm['preferredContact'])}
      >
        <option value="message">In-app messages</option>
        <option value="phone">Phone call or text</option>
        <option value="email">Email</option>
      </Select>
    </div>
  );
}

export function OnboardingNav({
  step,
  totalSteps,
  saving,
  onBack,
  onNext,
}: {
  step: number;
  totalSteps: number;
  saving: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const isLast = step === totalSteps - 1;
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <Button variant="ghost" onClick={onBack} disabled={step === 0 || saving}>
        Back
      </Button>
      <div className="flex items-center gap-2">
        <Button onClick={onNext} loading={saving}>
          {isLast ? 'Finish setup' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}

function StepHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</div>
      <div>
        <h2 className="text-lg font-semibold text-brand-900">{title}</h2>
        <p className="text-sm text-brand-500">{description}</p>
      </div>
    </div>
  );
}
