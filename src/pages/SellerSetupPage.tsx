import { useEffect, useState, type FormEvent } from 'react';
import { Store, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { Municipality, SellerProfile } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { LocationSelect } from '@/components/location/LocationSelect';
import { slugify } from '@/lib/utils';

export function SellerSetupPage() {
  const { user, role, refreshProfile } = useAuth();
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [existingSeller, setExistingSeller] = useState<SellerProfile | null>(null);
  const [shopName, setShopName] = useState('');
  const [description, setDescription] = useState('');
  const [municipalityId, setMunicipalityId] = useState('');
  const [barangayId, setBarangayId] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: muniData }, { data: sellerData }] = await Promise.all([
        supabase.from('municipalities').select('*').order('name'),
        supabase.from('seller_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      ]);
      setMunicipalities(muniData as Municipality[] ?? []);
      setExistingSeller(sellerData as SellerProfile | null);
      if (sellerData) {
        setShopName(sellerData.shop_name);
        setDescription(sellerData.description ?? '');
        setMunicipalityId(sellerData.municipality_id ?? '');
        setBarangayId(sellerData.barangay_id ?? '');
        setContactPhone(sellerData.contact_phone ?? '');
        setContactEmail(sellerData.contact_email ?? '');
      }
      setFetching(false);
    })();
  }, [user]);

  if (!user) {
    return (
      <div className="container-app py-16 text-center">
        <p className="text-brand-600 mb-4">Please sign in to become a seller.</p>
        <Button onClick={() => navigate('/signin')}>Sign In</Button>
      </div>
    );
  }

  if (fetching) {
    return <div className="container-app py-16"><div className="animate-pulse h-8 bg-cream-100 rounded w-1/2" /></div>;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!shopName.trim()) {
      setError('Shop name is required.');
      return;
    }

    setLoading(true);
    const slug = slugify(shopName);
    const payload = {
      user_id: user.id,
      shop_name: shopName.trim(),
      slug,
      description: description.trim() || null,
      municipality_id: municipalityId || null,
      barangay_id: barangayId || null,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
    };

    if (existingSeller) {
      const { error: updateError } = await supabase
        .from('seller_profiles')
        .update(payload)
        .eq('id', existingSeller.id);
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from('seller_profiles')
        .insert(payload);
      if (insertError) {
        setError(insertError.message);
        setLoading(false);
        return;
      }
    }

    await refreshProfile();
    setLoading(false);
    navigate(`/seller/${slug}`);
  };

  return (
    <div className="container-app max-w-2xl py-8 animate-fade-in">
      <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Store className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">
            {existingSeller ? 'Edit Your Store' : 'Become a Seller'}
          </h1>
          <p className="text-sm text-brand-500">Set up your storefront on MariMarket</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-2xl border border-brand-100 shadow-sm p-6">
        <Input
          label="Shop Name"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          placeholder="e.g., Boac Fresh Produce"
          required
        />
        <Textarea
          label="Shop Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Tell buyers about your shop..."
        />
        <LocationSelect
          municipalities={municipalities}
          municipalityId={municipalityId}
          barangayId={barangayId}
          onMunicipalityChange={setMunicipalityId}
          onBarangayChange={setBarangayId}
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label="Contact Phone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="09XX XXX XXXX"
          />
          <Input
            label="Contact Email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="shop@example.com"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {existingSeller ? 'Save Changes' : 'Create Store'}
        </Button>
        {!existingSeller && role === 'buyer' && (
          <p className="text-xs text-brand-400 text-center">
            Your seller profile will be created. An admin will need to upgrade your account role to seller for full access.
          </p>
        )}
      </form>
    </div>
  );
}
