import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, MapPin, MapPinned, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { Municipality, UserAddress } from '@/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { FormAlert } from '@/components/auth/AuthLayout';
import { AddressFormModal } from '@/components/account/AddressFormModal';

interface AddressRow extends UserAddress {
  municipality: { name: string } | null;
  barangay: { name: string } | null;
}

export function AddressesPage() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserAddress | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AddressRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_addresses')
      .select('*, municipality:municipalities(name), barangay:barangays(name)')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) {
      setLoadError('Your addresses could not be loaded. Refresh and try again.');
      return;
    }
    setLoadError(null);
    setAddresses((data as AddressRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const [, municipalityRes] = await Promise.all([
        loadAddresses(),
        supabase.from('municipalities').select('*').order('name'),
      ]);
      if (!active) return;
      if (municipalityRes.error) setLoadError('Could not load municipalities. Refresh and try again.');
      setMunicipalities((municipalityRes.data as Municipality[] | null) ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user, loadAddresses]);

  if (!user) {
    return (
      <div className="container-app py-16 text-center">
        <Button onClick={() => navigate('/signin')}>Sign In</Button>
      </div>
    );
  }

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (address: AddressRow) => {
    setEditing(address);
    setFormOpen(true);
  };

  const makeDefault = async (address: AddressRow) => {
    setActionError(null);
    setBusyId(address.id);
    const { error } = await supabase.rpc('set_default_address', { p_address_id: address.id });
    setBusyId(null);
    if (error) {
      setActionError('We could not change your default address. Please try again.');
      return;
    }
    await loadAddresses();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setActionError(null);
    setBusyId(pendingDelete.id);
    const { data, error } = await supabase.from('user_addresses').delete().eq('id', pendingDelete.id).select('id');
    setBusyId(null);
    setPendingDelete(null);
    if (error || !data || data.length === 0) {
      setActionError('We could not delete this address. Please try again.');
      return;
    }
    await loadAddresses();
  };

  return (
    <div className="container-app max-w-3xl py-8 animate-fade-in space-y-6">
      <button onClick={() => navigate('/profile')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <MapPinned className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-brand-900">Delivery addresses</h1>
            <p className="text-sm text-brand-500">Save addresses for faster checkout.</p>
          </div>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4" /> Add address</Button>
      </div>

      {actionError && <FormAlert tone="error">{actionError}</FormAlert>}
      {loadError && <FormAlert tone="error">{loadError}</FormAlert>}

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => <div key={i} className="h-32 rounded-2xl bg-cream-100 animate-pulse" />)}
        </div>
      ) : addresses.length === 0 && !loadError ? (
        <EmptyState
          icon={<MapPin className="h-10 w-10 text-brand-300" />}
          title="No saved addresses yet"
          description="Add your delivery address so checkout is ready when you find something you like."
          action={<Button onClick={openAdd}><Plus className="h-4 w-4" /> Add your first address</Button>}
        />
      ) : (
        <ul className="space-y-4">
          {addresses.map((address) => (
            <li key={address.id} className={`rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${address.is_default ? 'border-brand-400' : 'border-brand-100'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-brand-900">{address.label}</h2>
                    {address.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                        <Star className="h-3 w-3" /> Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-brand-800">{address.recipient_name}</p>
                  <p className="text-sm text-brand-600">{address.phone}</p>
                  <p className="text-sm text-brand-600">
                    {address.street}, {address.barangay?.name}, {address.municipality?.name}
                  </p>
                  {address.landmark && <p className="text-sm text-brand-500">Landmark: {address.landmark}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(address)} disabled={busyId !== null}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  {!address.is_default && (
                    <Button size="sm" variant="secondary" onClick={() => makeDefault(address)} loading={busyId === address.id}>
                      Set as default
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setPendingDelete(address)} disabled={busyId !== null}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddressFormModal
        open={formOpen}
        address={editing}
        municipalities={municipalities}
        onClose={() => setFormOpen(false)}
        onSaved={loadAddresses}
      />

      <Modal open={pendingDelete !== null} onClose={() => setPendingDelete(null)} title="Delete this address?" size="sm">
        <p className="text-sm text-brand-600">
          {pendingDelete?.label} will be removed from your saved addresses. This does not change past orders.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setPendingDelete(null)}>Keep address</Button>
          <Button variant="danger" onClick={confirmDelete} loading={busyId === pendingDelete?.id}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
