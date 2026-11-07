import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MapPin, Pencil, Plus, Search, Shield, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { Barangay, Municipality } from '@/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { GeoFormModal } from '@/components/admin/GeoFormModal';
import { BarangayImportModal } from '@/components/admin/BarangayImportModal';
import { geoNameKey } from '@/lib/geography';

type FormState =
  | { kind: 'municipality'; record: Municipality | null }
  | { kind: 'barangay'; record: Barangay | null };

export function AdminLocationsPage() {
  const { user, role } = useAuth();
  const canManage = role === 'administrator' || role === 'super_admin';
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<Barangay | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [muniRes, brgyRes] = await Promise.all([
      supabase.from('municipalities').select('*').order('name'),
      supabase.from('barangays').select('*').order('name'),
    ]);
    setLoading(false);
    if (muniRes.error || brgyRes.error) {
      setLoadError('Could not load locations. Try again.');
      return;
    }
    setMunicipalities((muniRes.data as Municipality[]) ?? []);
    setBarangays((brgyRes.data as Barangay[]) ?? []);
  }, []);

  useEffect(() => {
    if (user && canManage) loadAll();
  }, [user, canManage, loadAll]);

  const activeId = selectedId || municipalities[0]?.id || '';
  const activeMunicipality = municipalities.find((m) => m.id === activeId) ?? null;

  const countByMunicipality = useMemo(() => {
    const counts = new Map<string, number>();
    barangays.forEach((b) => counts.set(b.municipality_id, (counts.get(b.municipality_id) ?? 0) + 1));
    return counts;
  }, [barangays]);

  const municipalityBarangays = useMemo(
    () => barangays.filter((b) => b.municipality_id === activeId),
    [barangays, activeId],
  );

  const visibleBarangays = useMemo(() => {
    const term = geoNameKey(search);
    if (!term) return municipalityBarangays;
    return municipalityBarangays.filter((b) => geoNameKey(b.name).includes(term));
  }, [municipalityBarangays, search]);

  const defaults = useMemo(
    () => (municipalities[0] ? { province: municipalities[0].province, region: municipalities[0].region } : undefined),
    [municipalities],
  );

  const municipalityNames = municipalities.map((m) => m.name);
  const barangayNames = municipalityBarangays.map((b) => b.name);

  const handleSaved = (message: string) => {
    setForm(null);
    setNotice(message);
    setActionError(null);
    loadAll();
  };

  const requestDelete = (barangay: Barangay) => {
    setActionError(null);
    setNotice(null);
    setDeleting(barangay);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    const { count, error: checkError } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('barangay_id', deleting.id);
    if (checkError) {
      setDeleteBusy(false);
      setActionError('Could not check whether this barangay is in use. Try again.');
      setDeleting(null);
      return;
    }
    if ((count ?? 0) > 0) {
      setDeleteBusy(false);
      setActionError(`"${deleting.name}" is used by ${count} product listing(s), so it cannot be deleted. Rename it instead if the name is wrong.`);
      setDeleting(null);
      return;
    }

    const { data, error } = await supabase.from('barangays').delete().eq('id', deleting.id).select('id');
    setDeleteBusy(false);
    setDeleting(null);
    if (error?.code === '23503') {
      setActionError(`"${deleting.name}" is still linked to saved addresses, so it cannot be deleted.`);
      return;
    }
    if (error || !data?.length) {
      setActionError(error ? 'Could not delete this barangay. Try again.' : 'Nothing was deleted. Your account may not have permission.');
      return;
    }
    setNotice(`"${deleting.name}" was deleted.`);
    loadAll();
  };

  if (!user) {
    return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  }

  if (!canManage) {
    return (
      <div className="container-app py-12">
        <EmptyState
          icon={<Shield className="h-8 w-8" />}
          title="Access denied"
          description="Only administrators can manage municipalities and barangays."
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/admin')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to administration
      </button>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Locations</h1>
          <p className="text-sm text-brand-500 mt-1">Manage the municipalities and barangays of Marinduque.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={loading || municipalities.length === 0}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
          <Button onClick={() => setForm({ kind: 'municipality', record: null })} disabled={loading}>
            <Plus className="h-4 w-4" /> Add municipality
          </Button>
        </div>
      </div>

      {notice && <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-800">{notice}</div>}
      {actionError && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{actionError}</div>}

      {loadError && (
        <div className="mb-4 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
          {loadError}
          <Button variant="ghost" size="sm" onClick={loadAll}>Retry</Button>
        </div>
      )}

      {loading ? (
        <div className="grid lg:grid-cols-[280px_1fr] gap-6 animate-pulse">
          <div className="h-80 bg-cream-100 rounded-xl" />
          <div className="h-80 bg-cream-100 rounded-xl" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-6">
          <aside className="bg-white rounded-xl border border-brand-100 p-2 self-start">
            <ul className="space-y-1">
              {municipalities.map((m) => {
                const active = m.id === activeId;
                return (
                  <li key={m.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setSelectedId(m.id); setSearch(''); }}
                      className={`flex-1 flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-left transition-colors ${active ? 'bg-brand-600 text-white' : 'text-brand-800 hover:bg-brand-50'}`}
                    >
                      <span className="flex items-center gap-2"><MapPin className="h-4 w-4" />{m.name}</span>
                      <span className={`text-xs ${active ? 'text-brand-100' : 'text-brand-400'}`}>{countByMunicipality.get(m.id) ?? 0}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Edit ${m.name}`}
                      onClick={() => setForm({ kind: 'municipality', record: m })}
                      className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="bg-white rounded-xl border border-brand-100 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-brand-900">{activeMunicipality?.name ?? 'No municipality'}</h2>
                <p className="text-xs text-brand-400">{municipalityBarangays.length} barangay{municipalityBarangays.length === 1 ? '' : 's'}</p>
              </div>
              <Button size="sm" onClick={() => activeMunicipality && setForm({ kind: 'barangay', record: null })} disabled={!activeMunicipality}>
                <Plus className="h-4 w-4" /> Add barangay
              </Button>
            </div>

            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search barangays..."
                aria-label="Search barangays"
                className="w-full rounded-lg border border-brand-200 bg-white py-2.5 pl-9 pr-3 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>

            {visibleBarangays.length === 0 ? (
              <EmptyState
                icon={<MapPin className="h-8 w-8" />}
                title={search ? 'No matching barangays' : 'No barangays yet'}
                description={search ? 'Try a different search term.' : 'Add barangays one at a time or import an official list.'}
              />
            ) : (
              <ul className="divide-y divide-brand-100 max-h-[480px] overflow-auto">
                {visibleBarangays.map((b) => (
                  <li key={b.id} className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-brand-800">{b.name}</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label={`Edit ${b.name}`}
                        onClick={() => setForm({ kind: 'barangay', record: b })}
                        className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${b.name}`}
                        onClick={() => requestDelete(b)}
                        className="p-2 rounded-lg text-brand-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {form && (
        <GeoFormModal
          open
          kind={form.kind}
          record={form.record}
          municipalityId={activeId}
          siblingNames={form.kind === 'municipality' ? municipalityNames : barangayNames}
          defaults={form.kind === 'municipality' ? defaults : undefined}
          onClose={() => setForm(null)}
          onSaved={handleSaved}
        />
      )}

      <BarangayImportModal
        open={importOpen}
        municipalities={municipalities}
        existing={barangays}
        onClose={() => setImportOpen(false)}
        onImported={(count) => {
          setImportOpen(false);
          setNotice(`${count} barangay${count === 1 ? '' : 's'} imported.`);
          loadAll();
        }}
      />

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Delete barangay" size="sm">
        <p className="text-sm text-brand-600 mb-5">
          Delete <span className="font-semibold">{deleting?.name}</span>? This only works when no product listing uses it.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete} loading={deleteBusy}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
