import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Tag, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, AlertCircle, Layers,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import type { ProductConditionOption } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';

const CATEGORY_GROUPS = [
  { value: 'all', label: 'All Categories' },
  { value: 'secondhand', label: 'Secondhand Items' },
  { value: 'handmade', label: 'Handmade / Crafted' },
  { value: 'fresh', label: 'Fresh / Local Produce' },
];

export function AdminConditionsPage() {
  const [conditions, setConditions] = useState<ProductConditionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductConditionOption | null>(null);
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [categoryGroup, setCategoryGroup] = useState('all');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductConditionOption | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('product_conditions').select('*').order('sort_order');
    setConditions((data as ProductConditionOption[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setValue('');
    setLabel('');
    setDescription('');
    setCategoryGroup('all');
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (cond: ProductConditionOption) => {
    setEditing(cond);
    setValue(cond.value);
    setLabel(cond.label);
    setDescription(cond.description ?? '');
    setCategoryGroup(cond.category_group);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!value.trim()) { setFormError('Condition value is required (e.g., brand_new).'); return; }
    if (!label.trim()) { setFormError('Display label is required.'); return; }
    if (!/^[a-z0-9_]+$/.test(value.trim())) { setFormError('Value must be lowercase letters, numbers, and underscores only.'); return; }
    setSaving(true);
    const payload = {
      value: value.trim().toLowerCase(),
      label: label.trim(),
      description: description.trim() || null,
      category_group: categoryGroup,
    };
    if (editing) {
      const { error: err } = await supabase.from('product_conditions').update(payload).eq('id', editing.id);
      if (err) { setFormError(err.message); setSaving(false); return; }
      setNotice(`"${label}" was updated.`);
    } else {
      const { count } = await supabase.from('product_conditions').select('*', { count: 'exact', head: true });
      const { error: err } = await supabase.from('product_conditions').insert({ ...payload, sort_order: (count ?? 0) + 1, is_active: true });
      if (err) { setFormError(err.message); setSaving(false); return; }
      setNotice(`"${label}" was created.`);
    }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const toggleActive = async (cond: ProductConditionOption) => {
    await supabase.from('product_conditions').update({ is_active: !cond.is_active }).eq('id', cond.id);
    load();
  };

  const move = async (cond: ProductConditionOption, direction: 'up' | 'down') => {
    const sorted = [...conditions].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((c) => c.id === cond.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx], b = sorted[swapIdx];
    await Promise.all([
      supabase.from('product_conditions').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('product_conditions').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const { error: err } = await supabase.from('product_conditions').delete().eq('id', deleteTarget.id);
    setDeleteBusy(false);
    if (err) {
      setDeleteError(err.message);
      return;
    }
    setNotice(`"${deleteTarget.label}" was deleted.`);
    setDeleteTarget(null);
    load();
  };

  if (loading) {
    return <div className="container-app py-12 animate-pulse"><div className="h-8 bg-cream-100 rounded w-1/4" /></div>;
  }

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/admin')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        ← Back to admin
      </button>
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 text-white">
          <Layers className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Condition Management</h1>
          <p className="text-sm text-brand-500">Create, edit, and manage product condition options</p>
        </div>
      </div>

      {notice && <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-800">{notice}</div>}

      <div className="flex justify-end mb-4">
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> New Condition</Button>
      </div>

      {conditions.length > 0 ? (
        <div className="space-y-2">
          {conditions.map((cond) => {
            const groupLabel = CATEGORY_GROUPS.find((g) => g.value === cond.category_group)?.label ?? cond.category_group;
            return (
              <div key={cond.id} className="bg-white rounded-xl border border-brand-100 p-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 shrink-0">
                  <Tag className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-brand-900">{cond.label}</span>
                    <code className="text-xs text-brand-400 bg-cream-50 px-1.5 py-0.5 rounded">{cond.value}</code>
                    <Badge variant={cond.is_active ? 'success' : 'default'}>{cond.is_active ? 'Active' : 'Inactive'}</Badge>
                    <Badge variant="info">{groupLabel}</Badge>
                  </div>
                  {cond.description && <p className="text-xs text-brand-500 truncate mt-0.5">{cond.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => move(cond, 'up')} aria-label="Move up" className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50"><ArrowUp className="h-4 w-4" /></button>
                  <button onClick={() => move(cond, 'down')} aria-label="Move down" className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50"><ArrowDown className="h-4 w-4" /></button>
                  <button onClick={() => toggleActive(cond)} aria-label="Toggle active" className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50">
                    {cond.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button onClick={() => openEdit(cond)} aria-label="Edit" className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => { setDeleteError(null); setDeleteTarget(cond); }} aria-label="Delete" className="p-2 rounded-lg text-brand-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Layers className="h-8 w-8" />}
          title="No conditions yet"
          description="Create your first product condition option."
          action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> New Condition</Button>}
        />
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Condition' : 'New Condition'} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Value" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g., brand_new" hint="Lowercase with underscores. This is the internal identifier." disabled={!!editing} required />
          <Input label="Display Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g., Brand New" required />
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Short explanation shown to sellers when choosing this condition..." />
          <Select label="Category Group" value={categoryGroup} onChange={(e) => setCategoryGroup(e.target.value)}>
            {CATEGORY_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </Select>
          {formError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{formError}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing ? 'Save Changes' : 'Create Condition'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete condition" size="sm">
        <p className="text-sm text-brand-600 mb-3">
          Delete "{deleteTarget?.label}"? Products already using this condition will fail validation on their next update. Consider deactivating instead.
        </p>
        {deleteError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 mb-3 flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {deleteError}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleteBusy}>Delete permanently</Button>
        </div>
      </Modal>
    </div>
  );
}
