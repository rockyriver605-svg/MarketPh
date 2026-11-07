import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import type { Municipality, UserAddress } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { FormAlert } from '@/components/auth/AuthLayout';
import { LocationSelect } from '@/components/location/LocationSelect';
import { normalizePhone, validatePhone } from '@/lib/validation';

interface AddressFormModalProps {
  open: boolean;
  address: UserAddress | null;
  municipalities: Municipality[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

interface AddressDraft {
  label: string;
  recipientName: string;
  phone: string;
  municipalityId: string;
  barangayId: string;
  street: string;
  landmark: string;
}

type AddressErrors = Partial<Record<keyof AddressDraft, string>>;

function draftFrom(address: UserAddress | null): AddressDraft {
  return {
    label: address?.label ?? 'Home',
    recipientName: address?.recipient_name ?? '',
    phone: address?.phone ?? '',
    municipalityId: address?.municipality_id ?? '',
    barangayId: address?.barangay_id ?? '',
    street: address?.street ?? '',
    landmark: address?.landmark ?? '',
  };
}

function validateDraft(draft: AddressDraft): AddressErrors {
  const errors: AddressErrors = {};
  if (!draft.label.trim()) errors.label = 'Give this address a label, such as Home.';
  if (draft.recipientName.trim().length < 2) errors.recipientName = 'Enter the recipient name.';
  errors.phone = validatePhone(draft.phone) ?? (draft.phone.trim() ? undefined : 'Enter a contact number.');
  if (!draft.municipalityId) errors.municipalityId = 'Select your municipality.';
  if (!draft.barangayId) errors.barangayId = 'Select your barangay.';
  if (!draft.street.trim()) errors.street = 'Enter the street or house details.';
  return errors;
}

export function AddressFormModal({ open, address, municipalities, onClose, onSaved }: AddressFormModalProps) {
  const [draft, setDraft] = useState<AddressDraft>(() => draftFrom(address));
  const [errors, setErrors] = useState<AddressErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(draftFrom(address));
    setErrors({});
    setSaveError(null);
  }, [open, address]);

  const update = <K extends keyof AddressDraft>(key: K, value: AddressDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSaving(true);
    try {
      const payload = {
        label: draft.label.trim(),
        recipient_name: draft.recipientName.trim(),
        phone: normalizePhone(draft.phone),
        municipality_id: draft.municipalityId,
        barangay_id: draft.barangayId,
        street: draft.street.trim(),
        landmark: draft.landmark.trim() || null,
      };
      const query = address
        ? supabase.from('user_addresses').update(payload).eq('id', address.id).select('id')
        : supabase.from('user_addresses').insert(payload).select('id');
      const { data, error } = await query;
      if (error) {
        setSaveError('We could not save this address. Please check the details and try again.');
        return;
      }
      if (!data || data.length === 0) {
        setSaveError('We could not save this address. Please sign in again and retry.');
        return;
      }
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={address ? 'Edit address' : 'Add an address'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Label" value={draft.label} onChange={(e) => update('label', e.target.value)} error={errors.label} placeholder="Home, Office..." />
          <Input label="Recipient name" value={draft.recipientName} onChange={(e) => update('recipientName', e.target.value)} error={errors.recipientName} />
        </div>
        <Input label="Contact number" value={draft.phone} onChange={(e) => update('phone', e.target.value)} error={errors.phone} placeholder="09XX XXX XXXX" />
        <LocationSelect
          municipalities={municipalities}
          municipalityId={draft.municipalityId}
          barangayId={draft.barangayId}
          onMunicipalityChange={(id) => {
            update('municipalityId', id);
            update('barangayId', '');
          }}
          onBarangayChange={(id) => update('barangayId', id)}
          municipalityError={errors.municipalityId}
          barangayError={errors.barangayId}
        />
        <Input label="Street and house details" value={draft.street} onChange={(e) => update('street', e.target.value)} error={errors.street} placeholder="House no., street, purok" />
        <Textarea label="Landmark (optional)" value={draft.landmark} onChange={(e) => update('landmark', e.target.value)} rows={2} placeholder="Near the school, beside the chapel..." />

        {saveError && <FormAlert tone="error">{saveError}</FormAlert>}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{address ? 'Save address' : 'Add address'}</Button>
        </div>
      </form>
    </Modal>
  );
}
