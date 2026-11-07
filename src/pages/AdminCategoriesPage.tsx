import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Tag, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Search, ChevronRight, ChevronDown,
  Eye, EyeOff, AlertCircle, FolderTree,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import type { Category } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { getCategoryIcon, availableIconNames } from '@/lib/categoryIcons';
import { slugify } from '@/lib/utils';

interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[];
  product_count: number;
}

export function AdminCategoriesPage() {
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [parentId, setParentId] = useState<string | ''>('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconName, setIconName] = useState('Package');
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order');
    if (error) { setLoading(false); return; }
    const all = (data as Category[]) ?? [];
    const productCounts = await Promise.all(
      all.map(async (cat) => {
        const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('category_id', cat.id);
        return { id: cat.id, count: count ?? 0 };
      }),
    );
    const countMap = new Map(productCounts.map((p) => [p.id, p.count]));
    const buildTree = (parentId: string | null): CategoryWithChildren[] =>
      all
        .filter((c) => c.parent_id === parentId)
        .map((c) => ({ ...c, children: buildTree(c.id), product_count: countMap.get(c.id) ?? 0 }))
        .sort((a, b) => a.sort_order - b.sort_order);
    setCategories(buildTree(null));
    setExpanded(new Set(all.filter((c) => c.parent_id === null).map((c) => c.id)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const flatFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const result: CategoryWithChildren[] = [];
    const walk = (cats: CategoryWithChildren[], depth: number) => {
      for (const cat of cats) {
        const matchesSearch = !term || cat.name.toLowerCase().includes(term) || (cat.slug ?? '').includes(term);
        const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && cat.is_active) || (statusFilter === 'inactive' && !cat.is_active);
        if (matchesSearch && matchesStatus) result.push({ ...cat, _depth: depth } as CategoryWithChildren & { _depth: number });
        if (cat.children.length > 0) walk(cat.children, depth + 1);
      }
    };
    walk(categories, 0);
    return result;
  }, [categories, search, statusFilter]);

  const openCreate = (parent: Category | null) => {
    setEditing(null);
    setParentId(parent?.id ?? '');
    setName('');
    setDescription('');
    setIconName('Package');
    setImageUrl('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setParentId(cat.parent_id ?? '');
    setName(cat.name);
    setDescription(cat.description ?? '');
    setIconName(cat.icon_name ?? 'Package');
    setImageUrl(cat.image_url ?? '');
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) { setFormError('Category name is required.'); return; }
    const slug = slugify(name);
    if (!slug) { setFormError('Could not generate a valid slug from the name.'); return; }
    setSaving(true);
    const payload = {
      name: name.trim(),
      slug,
      description: description.trim() || null,
      icon_name: iconName,
      image_url: imageUrl.trim() || null,
      parent_id: parentId || null,
    };
    if (editing) {
      const { error: err } = await supabase.from('categories').update(payload).eq('id', editing.id);
      if (err) { setFormError(err.message); setSaving(false); return; }
      setNotice(`"${name}" was updated.`);
    } else {
      const { count: maxCount } = await supabase.from('categories').select('*', { count: 'exact', head: true }).is('parent_id', parentId || null);
      const { error: err } = await supabase.from('categories').insert({ ...payload, sort_order: (maxCount ?? 0) + 1 });
      if (err) { setFormError(err.message); setSaving(false); return; }
      setNotice(`"${name}" was created.`);
    }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const toggleActive = async (cat: Category) => {
    await supabase.from('categories').update({ is_active: !cat.is_active }).eq('id', cat.id);
    load();
  };

  const move = async (cat: Category, direction: 'up' | 'down') => {
    const siblings = categories.find((c) => c.id === cat.parent_id)?.children ?? categories;
    const sorted = [...siblings].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((c) => c.id === cat.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx], b = sorted[swapIdx];
    await Promise.all([
      supabase.from('categories').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('categories').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const { error: err } = await supabase.rpc('safe_delete_category', { p_category_id: deleteTarget.id });
    setDeleteBusy(false);
    if (err) {
      setDeleteError(err.message);
      return;
    }
    setNotice(`"${deleteTarget.name}" was deleted.`);
    setDeleteTarget(null);
    load();
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
          <FolderTree className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Category Management</h1>
          <p className="text-sm text-brand-500">Create, edit, and organize product categories and subcategories</p>
        </div>
      </div>

      {notice && <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-800">{notice}</div>}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')} className="h-10 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900">
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
        <Button onClick={() => openCreate(null)}><Plus className="h-4 w-4" /> New Category</Button>
      </div>

      {flatFiltered.length > 0 ? (
        <div className="space-y-2">
          {flatFiltered.map((cat) => {
            const depth = (cat as CategoryWithChildren & { _depth?: number })._depth ?? 0;
            const Icon = getCategoryIcon(cat.icon_name);
            const hasChildren = cat.children.length > 0;
            const isExpanded = expanded.has(cat.id);
            return (
              <div key={cat.id} className="bg-white rounded-xl border border-brand-100 p-3 flex items-center gap-3" style={{ paddingLeft: `${12 + depth * 24}px` }}>
                {hasChildren ? (
                  <button onClick={() => toggleExpand(cat.id)} className="p-1 rounded hover:bg-brand-50 text-brand-400">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                ) : (
                  <div className="w-6" />
                )}
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 shrink-0">
                  {cat.image_url ? <img src={cat.image_url} alt={cat.name} className="h-full w-full rounded-lg object-cover" /> : <Icon className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-brand-900 truncate">{cat.name}</span>
                    <Badge variant={cat.is_active ? 'success' : 'default'}>{cat.is_active ? 'Active' : 'Inactive'}</Badge>
                    {cat.product_count > 0 && <span className="text-xs text-brand-400">{cat.product_count} product{cat.product_count === 1 ? '' : 's'}</span>}
                  </div>
                  {cat.description && <p className="text-xs text-brand-500 truncate mt-0.5">{cat.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => move(cat, 'up')} aria-label="Move up" className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50"><ArrowUp className="h-4 w-4" /></button>
                  <button onClick={() => move(cat, 'down')} aria-label="Move down" className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50"><ArrowDown className="h-4 w-4" /></button>
                  <button onClick={() => openCreate(cat)} aria-label="Add subcategory" title="Add subcategory" className="p-2 rounded-lg text-brand-400 hover:text-green-600 hover:bg-green-50"><Plus className="h-4 w-4" /></button>
                  <button onClick={() => toggleActive(cat)} aria-label="Toggle active" className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50">
                    {cat.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button onClick={() => openEdit(cat)} aria-label="Edit" className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => { setDeleteError(null); setDeleteTarget(cat); }} aria-label="Delete" className="p-2 rounded-lg text-brand-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Tag className="h-8 w-8" />}
          title={categories.length === 0 ? 'No categories yet' : 'No matching categories'}
          description={categories.length === 0 ? 'Create your first product category.' : 'Try a different search or filter.'}
          action={categories.length === 0 ? <Button onClick={() => openCreate(null)}><Plus className="h-4 w-4" /> New Category</Button> : undefined}
        />
      )}

      {/* Create / Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Category' : 'New Category'} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Electronics & Gadgets" required />
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional description..." />
          <div>
            <label className="block text-sm font-medium text-brand-900 mb-1.5">Icon</label>
            <div className="flex flex-wrap gap-2">
              {availableIconNames.map(({ name: icon, Icon }) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setIconName(icon)}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${iconName === icon ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-brand-600 border-brand-200 hover:border-brand-400'}`}
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>
          <Input label="Image URL (optional)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." hint="Overrides the icon if provided" />
          <Select label="Parent Category" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">None (top-level)</option>
            {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </Select>
          {formError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{formError}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>{editing ? 'Save Changes' : 'Create Category'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete category" size="sm">
        <div className="flex items-start gap-3 mb-4">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-brand-600">
            Delete "{deleteTarget?.name}"? This is permanent. Categories with products or subcategories cannot be deleted.
          </p>
        </div>
        {deleteError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 mb-4">{deleteError}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleteBusy}>Delete permanently</Button>
        </div>
      </Modal>
    </div>
  );
}
