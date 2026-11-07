import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, BadgeCheck, CalendarDays, Heart, MapPin, Package, Settings, Store, MailCheck, MailWarning, MapPinned } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { Municipality, SellerProfile } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { FormAlert } from '@/components/auth/AuthLayout';
import { AvatarUploader } from '@/components/account/AvatarUploader';
import { LocationSelect } from '@/components/location/LocationSelect';
import {
  normalizePhone,
  normalizeUsername,
  validateFullName,
  validatePhone,
  validateUsername,
} from '@/lib/validation';

type ProfileErrors = Partial<Record<'displayName' | 'username' | 'phone', string>>;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function ProfilePage() {
  const { user, profile, role, refreshProfile } = useAuth();
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [counts, setCounts] = useState({ orders: 0, favorites: 0 });
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [municipalityId, setMunicipalityId] = useState('');
  const [barangayId, setBarangayId] = useState('');
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? '');
    setUsername(profile.username ?? '');
    setPhone(profile.phone ?? '');
    setBio(profile.bio ?? '');
    setMunicipalityId(profile.municipality_id ?? '');
    setBarangayId(profile.barangay_id ?? '');
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const [sellerRes, ordersRes, favoritesRes] = await Promise.all([
        supabase.from('seller_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('buyer_id', user.id),
        supabase.from('favorites').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      if (!active) return;
      if (!sellerRes.error) setSeller(sellerRes.data as SellerProfile | null);
      setCounts({
        orders: ordersRes.count ?? 0,
        favorites: favoritesRes.count ?? 0,
      });
    })();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;
    supabase.from('municipalities').select('*').order('name').then(({ data, error }) => {
      if (!active) return;
      if (error) setLocationsError('Could not load municipalities. Refresh and try again.');
      setMunicipalities((data as Municipality[] | null) ?? []);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!user || !profile) {
    return (
      <div className="container-app py-16 text-center">
        <Button onClick={() => navigate('/signin')}>Sign In</Button>
      </div>
    );
  }

  const isVerified = !!user.email_confirmed_at;
  const accountStatus = profile.deactivated_at
    ? { label: 'Deactivated', tone: 'bg-amber-50 text-amber-700 border-amber-200' }
    : profile.account_status === 'suspended'
      ? { label: 'Suspended', tone: 'bg-red-50 text-red-700 border-red-200' }
      : { label: 'Active', tone: 'bg-green-50 text-green-700 border-green-200' };

  const validate = async (): Promise<ProfileErrors> => {
    const next: ProfileErrors = {};
    next.displayName = validateFullName(displayName) ?? undefined;
    const usernameError = validateUsername(username);
    if (usernameError) {
      next.username = usernameError;
    } else if (normalizeUsername(username) !== (profile.username ?? '')) {
      const { data, error } = await supabase.rpc('is_username_available', { p_username: normalizeUsername(username) });
      if (error || typeof data !== 'boolean') next.username = 'Could not check this username. Try again.';
      else if (!data) next.username = 'This username is already taken.';
    }
    next.phone = validatePhone(phone) ?? undefined;
    return next;
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaved(false);
    setSaving(true);
    try {
      const nextErrors = await validate();
      setErrors(nextErrors);
      if (Object.values(nextErrors).some(Boolean)) return;

      const { data, error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          username: normalizeUsername(username),
          phone: phone.trim() ? normalizePhone(phone) : null,
          bio: bio.trim() || null,
          municipality_id: municipalityId || null,
          barangay_id: barangayId || null,
        })
        .eq('id', user.id)
        .select('id');
      if (error) {
        setSaveError(error.code === '23505' ? 'This username is already taken.' : 'We could not save your changes. Please try again.');
        return;
      }
      if (!data || data.length === 0) {
        setSaveError('We could not save your changes. Please sign in again and retry.');
        return;
      }
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-app max-w-3xl py-8 animate-fade-in space-y-6">
      <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </button>

      <section className="bg-white rounded-2xl border border-brand-100 shadow-sm p-6 sm:p-8 space-y-6">
        <AvatarUploader
          userId={user.id}
          displayName={profile.display_name}
          avatarUrl={profile.avatar_url}
          onChange={refreshProfile}
        />

        <div className="flex flex-wrap items-center gap-2 border-t border-brand-50 pt-6">
          <span className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            {role === 'seller' || seller ? 'Seller account' : 'Buyer account'}
          </span>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${accountStatus.tone}`}>{accountStatus.label}</span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${isVerified ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            {isVerified ? <MailCheck className="h-3.5 w-3.5" /> : <MailWarning className="h-3.5 w-3.5" />}
            {isVerified ? 'Email verified' : 'Email not verified'}
          </span>
          {seller && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent-200 bg-accent-50 px-3 py-1 text-xs font-medium text-accent-700">
              <BadgeCheck className="h-3.5 w-3.5" /> {seller.is_verified ? 'Verified seller' : 'Seller storefront'}
            </span>
          )}
        </div>

        <dl className="grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <dt className="text-brand-500">Email</dt>
            <dd className="font-medium text-brand-900 break-all">{user.email}</dd>
          </div>
          <div>
            <dt className="text-brand-500">Member since</dt>
            <dd className="flex items-center gap-1 font-medium text-brand-900"><CalendarDays className="h-4 w-4 text-brand-400" />{formatDate(user.created_at)}</dd>
          </div>
          <div>
            <dt className="text-brand-500">Activity</dt>
            <dd className="flex flex-wrap gap-3 font-medium text-brand-900">
              <span className="flex items-center gap-1"><Package className="h-4 w-4 text-brand-400" />{counts.orders} orders</span>
              <span className="flex items-center gap-1"><Heart className="h-4 w-4 text-brand-400" />{counts.favorites} saved</span>
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-3">
          {seller ? (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/seller/${seller.slug}`)}>
              <Store className="h-4 w-4" /> View storefront
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => navigate('/seller/setup')}>
              <Store className="h-4 w-4" /> Become a seller
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/addresses')}>
            <MapPinned className="h-4 w-4" /> Addresses
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
            <Settings className="h-4 w-4" /> Account settings
          </Button>
        </div>
      </section>

      <form onSubmit={handleSave} className="space-y-5 bg-white rounded-2xl border border-brand-100 shadow-sm p-6 sm:p-8">
        <div>
          <h2 className="text-lg font-semibold text-brand-900">Personal information</h2>
          <p className="text-sm text-brand-500">This is how you appear to other members.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Full name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} error={errors.displayName} required />
          <Input
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={errors.username}
            hint="3 to 30 characters: lowercase letters, numbers, and underscores."
            autoComplete="username"
          />
        </div>
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} placeholder="09XX XXX XXXX" />
        <Textarea label="About you" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="A short introduction for other members..." />

        <div className="border-t border-brand-50 pt-5">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4 text-brand-500" />
            <h3 className="text-sm font-semibold text-brand-900">Home location</h3>
          </div>
          <LocationSelect
            municipalities={municipalities}
            municipalityId={municipalityId}
            barangayId={barangayId}
            onMunicipalityChange={setMunicipalityId}
            onBarangayChange={setBarangayId}
          />
          {locationsError && <p className="mt-3 text-sm text-red-600">{locationsError}</p>}
        </div>

        {saveError && <FormAlert tone="error">{saveError}</FormAlert>}
        {saved && <FormAlert tone="success">Profile saved successfully!</FormAlert>}

        <Button type="submit" size="lg" loading={saving} className="w-full">Save changes</Button>
      </form>
    </div>
  );
}
