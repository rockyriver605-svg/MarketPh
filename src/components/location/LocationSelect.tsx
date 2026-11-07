import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Barangay, Municipality } from '@/types';
import { Select } from '@/components/ui/Input';

interface LocationSelectProps {
  municipalities: Municipality[];
  municipalityId: string;
  barangayId: string;
  onMunicipalityChange: (id: string) => void;
  onBarangayChange: (id: string) => void;
  municipalityError?: string;
  barangayError?: string;
  disabled?: boolean;
  municipalityPlaceholder?: string;
  stacked?: boolean;
}

export function LocationSelect({
  municipalities,
  municipalityId,
  barangayId,
  onMunicipalityChange,
  onBarangayChange,
  municipalityError,
  barangayError,
  disabled = false,
  municipalityPlaceholder = 'Select municipality...',
  stacked = false,
}: LocationSelectProps) {
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [loadingBarangays, setLoadingBarangays] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!municipalityId) {
      setBarangays([]);
      return;
    }
    let active = true;
    setLoadingBarangays(true);
    setLoadError(null);
    supabase
      .from('barangays')
      .select('*')
      .eq('municipality_id', municipalityId)
      .order('name')
      .then(({ data, error }) => {
        if (!active) return;
        setLoadingBarangays(false);
        if (error) {
          setLoadError('Could not load barangays. Try again.');
          setBarangays([]);
          return;
        }
        setBarangays((data as Barangay[] | null) ?? []);
      });
    return () => {
      active = false;
    };
  }, [municipalityId]);

  const selectedBarangay = barangays.find((b) => b.id === barangayId);

  useEffect(() => {
    setQuery(selectedBarangay?.name ?? '');
  }, [selectedBarangay?.name]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term || term === selectedBarangay?.name.toLowerCase()) return barangays;
    return barangays.filter((b) => b.name.toLowerCase().includes(term));
  }, [barangays, query, selectedBarangay]);

  const handleMunicipality = (id: string) => {
    onMunicipalityChange(id);
    onBarangayChange('');
    setQuery('');
  };

  const pickBarangay = (barangay: Barangay) => {
    onBarangayChange(barangay.id);
    setQuery(barangay.name);
    setOpen(false);
  };

  const barangayDisabled = disabled || !municipalityId;

  return (
    <div className={stacked ? 'space-y-4' : 'grid sm:grid-cols-2 gap-4'}>
      <Select
        label="Municipality"
        value={municipalityId}
        error={municipalityError}
        disabled={disabled}
        onChange={(e) => handleMunicipality(e.target.value)}
      >
        <option value="">{municipalityPlaceholder}</option>
        {municipalities.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </Select>

      <div className="relative">
        <label htmlFor="barangay-search" className="block text-sm font-medium text-brand-800 mb-1.5">Barangay</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
          <input
            id="barangay-search"
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            autoComplete="off"
            disabled={barangayDisabled}
            value={query}
            placeholder={municipalityId ? 'Search barangay...' : 'Select a municipality first'}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setQuery(selectedBarangay?.name ?? '');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter' && open && filtered.length > 0) {
                e.preventDefault();
                pickBarangay(filtered[0]);
              }
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              if (barangayId) onBarangayChange('');
            }}
            className={`w-full rounded-lg border bg-white py-2.5 pl-9 pr-9 text-sm text-brand-900 placeholder:text-brand-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-brand-50 disabled:text-brand-400 ${barangayError ? 'border-red-400' : 'border-brand-200 focus:border-brand-500'}`}
          />
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
        </div>

        {open && !barangayDisabled && (
          <ul role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-brand-100 bg-white py-1 shadow-lg">
            {loadingBarangays && <li className="px-3 py-2 text-sm text-brand-500">Loading barangays...</li>}
            {!loadingBarangays && filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-brand-500">No barangay matches "{query.trim()}".</li>
            )}
            {!loadingBarangays && filtered.map((b) => (
              <li key={b.id} role="option" aria-selected={b.id === barangayId}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickBarangay(b)}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-brand-50 ${b.id === barangayId ? 'font-semibold text-brand-800' : 'text-brand-700'}`}
                >
                  {b.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {(barangayError || loadError) && (
          <p className="mt-1 text-xs text-red-600">{barangayError ?? loadError}</p>
        )}
      </div>
    </div>
  );
}
