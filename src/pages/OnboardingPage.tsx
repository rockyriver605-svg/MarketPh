import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import type { Barangay, Municipality, Profile } from '@/types';
import { FormAlert } from '@/components/auth/AuthLayout';
import {
  DetailsStep,
  LocationStep,
  OnboardingNav,
  PhotoStep,
  PreferencesStep,
  type OnboardingErrors,
  type OnboardingForm,
} from '@/components/onboarding/OnboardingSteps';
import {
  normalizePhone,
  normalizeUsername,
  validateFullName,
  validatePhone,
  validateUsername,
} from '@/lib/validation';

const STEP_TITLES = ['Photo', 'Details', 'Location', 'Preferences'];
const PHOTO_BUCKET = 'profile-photos';

export function OnboardingPage() {
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading && profile?.onboarding_completed_at) navigate('/');
  }, [loading, profile]);

  if (loading || !user || !profile) {
    return (
      <div className="container-app max-w-2xl py-12">
        <div className="h-96 rounded-2xl bg-cream-100 animate-pulse" />
      </div>
    );
  }

  if (profile.onboarding_completed_at) return null;

  return <OnboardingWizard userId={user.id} profile={profile} />;
}

function initialForm(profile: Profile): OnboardingForm {
  return {
    photoFile: null,
    photoPreview: profile.avatar_url,
    fullName: profile.display_name ?? '',
    username: profile.username ?? '',
    phone: profile.phone ?? '',
    municipalityId: profile.municipality_id ?? '',
    barangayId: profile.barangay_id ?? '',
    emailNotifications: profile.preferences?.email_notifications ?? true,
    preferredContact: profile.preferences?.preferred_contact ?? 'message',
  };
}

function OnboardingWizard({ userId, profile }: { userId: string; profile: Profile }) {
  const { refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingForm>(() => initialForm(profile));
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('municipalities')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setSaveError('Could not load municipalities. Refresh and try again.');
        setMunicipalities((data as Municipality[] | null) ?? []);
        setLoadingLocations(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!form.municipalityId) {
      setBarangays([]);
      return;
    }
    supabase
      .from('barangays')
      .select('*')
      .eq('municipality_id', form.municipalityId)
      .order('name')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setSaveError('Could not load barangays. Try again.');
        setBarangays((data as Barangay[] | null) ?? []);
      });
    return () => {
      active = false;
    };
  }, [form.municipalityId]);

  const update = <K extends keyof OnboardingForm>(key: K, value: OnboardingForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validateStep = async (): Promise<OnboardingErrors> => {
    const next: OnboardingErrors = {};
    if (step === 1) {
      next.fullName = validateFullName(form.fullName) ?? undefined;
      next.username = validateUsername(form.username) ?? undefined;
      next.phone = validatePhone(form.phone) ?? (form.phone.trim() ? undefined : 'Enter your contact number.');
      if (!next.username && normalizeUsername(form.username) !== (profile.username ?? '')) {
        const { data, error } = await supabase.rpc('is_username_available', {
          p_username: normalizeUsername(form.username),
        });
        if (error || typeof data !== 'boolean') next.username = 'Could not check this username. Try again.';
        else if (!data) next.username = 'This username is already taken.';
      }
    }
    if (step === 2) {
      next.municipalityId = form.municipalityId ? undefined : 'Select your municipality.';
      next.barangayId = form.barangayId ? undefined : 'Select your barangay.';
    }
    return next;
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!form.photoFile) return profile.avatar_url;
    const extension = form.photoFile.type === 'image/png' ? 'png' : form.photoFile.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${userId}/avatar-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, form.photoFile, {
      contentType: form.photoFile.type,
      cacheControl: '3600',
    });
    if (error) throw new Error('Your photo could not be uploaded. Try a smaller image.');
    return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const finish = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const avatarUrl = await uploadPhoto();
      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: form.fullName.trim(),
          username: normalizeUsername(form.username),
          phone: normalizePhone(form.phone),
          municipality_id: form.municipalityId,
          barangay_id: form.barangayId,
          avatar_url: avatarUrl,
          preferences: {
            email_notifications: form.emailNotifications,
            preferred_contact: form.preferredContact,
          },
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('id');
      if (error) {
        setSaveError(error.code === '23505' ? 'This username is already taken.' : 'We could not save your profile. Please try again.');
        return;
      }
      if (!data || data.length === 0) {
        setSaveError('We could not save your profile. Please sign in again and retry.');
        return;
      }
      await refreshProfile();
      navigate('/');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    if (step < STEP_TITLES.length - 1) {
      const stepErrors = await validateStep();
      if (Object.values(stepErrors).some(Boolean)) {
        setErrors(stepErrors);
        return;
      }
      setStep((s) => s + 1);
      return;
    }
    await finish();
  };

  return (
    <div className="container-app max-w-2xl py-10 animate-fade-in">
      <div className="mb-8">
        <p className="text-sm font-medium text-brand-600">Step {step + 1} of {STEP_TITLES.length}</p>
        <h1 className="text-2xl font-bold text-brand-900 mt-1">Complete your profile</h1>
        <div className="mt-4 flex gap-2" aria-label="Onboarding progress">
          {STEP_TITLES.map((title, i) => (
            <div key={title} className="flex-1">
              <div className={`h-1.5 rounded-full transition-colors ${i <= step ? 'bg-brand-600' : 'bg-brand-100'}`} />
              <p className={`mt-1.5 text-xs ${i === step ? 'font-semibold text-brand-800' : 'text-brand-400'}`}>{title}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-brand-100 shadow-sm p-6 sm:p-8 space-y-6">
        {step === 0 && <PhotoStep form={form} errors={errors} update={update} />}
        {step === 1 && <DetailsStep form={form} errors={errors} update={update} />}
        {step === 2 && (
          <LocationStep
            form={form}
            errors={errors}
            update={update}
            municipalities={municipalities}
            barangays={barangays}
            loadingLocations={loadingLocations}
          />
        )}
        {step === 3 && <PreferencesStep form={form} errors={errors} update={update} />}

        {saveError && <FormAlert tone="error">{saveError}</FormAlert>}

        <OnboardingNav
          step={step}
          totalSteps={STEP_TITLES.length}
          saving={saving}
          onBack={() => setStep((s) => Math.max(0, s - 1))}
          onNext={handleNext}
        />
      </div>
    </div>
  );
}
