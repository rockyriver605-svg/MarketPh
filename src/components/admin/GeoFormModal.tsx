import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import type { Barangay, Municipality } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cleanGeoName, geoNameKey, validateGeoName } from '@/lib/geography';

interface GeoFormModalProps {
  open: boolean;
  kind: 'municipality' | 'barangay';
  record: Municipality | Barangay | null;
  municipalityId?: string;
  siblingNames: string[];
  defaults?: Pick<Municipality, 'province' | 'region'>;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function GeoFormModal({ open, kind, record, municipalityId, siblingNames, defaults, onClose, onSaved }: GeoFormModalProps) {
  const municipalityRecord = kind === 'municipality' ? (record as Municipality | null) : null;
  const [name, setName] = useState('');
  const [province, setProvince] = useState('');
  const [region, setRegion] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(record?.name ?? '');
    setProvince(municipalityRecord?.province ?? defaults?.province ?? 'Marinduque');
    setRegion(municipalityRecord?.region ?? defaults?.region ?? '');
    setNameError(null);
    setFormError(null);
  }, [open, record, defaults, municipalityRecord]);

  const title = kind === 'municipality'
    ? (record ? 'Edit municipality' : 'Add municipality')
    : (record ? 'Edit barangay' : 'Add barangay');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const nameProblem = validateGeoName(name);
    setNameError(nameProblem);
    if (nameProblem) return;

    const cleaned = cleanGeoName(name);
    const key = geoNameKey(cleaned);
    const duplicate = siblingNames.some((n) => geoNameKey(n) === key && n !== record?.name);
    if (duplicate) {
      setNameError(kind === 'municipality' ? 'A municipality with this name already exists.' : 'This barangay already exists in this municipality.');
      return;
    }

    if (kind === 'municipality' && (!province.trim() || !region.trim())) {
      setFormError('Province and region are required.');
      return;
    }

    setSaving(true);
    const payload = kind === 'municipality'
      ? { name: cleaned, province: province.trim(), region: region.trim() }
      : { name: cleaned, municipality_id: municipalityId };
    const table = kind === 'municipality' ? 'municipalities' : 'barangays';

    const query = record
      ? supabase.from(table).update(payload).eq('id', record.id).select('id')
      : supabase.from(table).insert(payload).select('id');
    const { data, error } = await query;
    setSaving(false);

    if (error) {
      setFormError(error.code === '23505'
        ? `That ${kind} already exists.`
        : 'Could not save. Check your admin permissions and try again.');
      return;
    }
    if (!data || data.length === 0) {
      setFormError('Nothing was saved. Your account may not have permission to change this.');
      return;
    }
    onSaved(record ? `${kind === 'municipality' ? 'Municipality' : 'Barangay'} updated.` : `${kind === 'municipality' ? 'Municipality' : 'Barangay'} added.`);
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError ?? undefined}
          autoFocus
          maxLength={80}
        />
        {kind === 'municipality' && (
          <>
            <Input label="Province" value={province} onChange={(e) => setProvince(e.target.value)} />
            <Input label="Region" value={region} onChange={(e) => setRegion(e.target.value)} />
          </>
        )}
        {formError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{formError}</div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{record ? 'Save changes' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}
