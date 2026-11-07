import { useEffect, useMemo, useState } from 'react';
import { Package, Search, Plus, History, AlertTriangle, XCircle, CheckCircle2, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import {
  fetchSellerInventory,
  fetchInventoryMovements,
  adjustStock,
  updateLowStockThreshold,
  getStockStatus,
  STOCK_STATUS_LABEL,
  type InventoryItem,
  type StockMovement,
  type InventoryStats,
} from '@/lib/inventory';
import type { ProductImage } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';

function productThumb(item: InventoryItem): string | null {
  const imgs = item.product?.product_images;
  if (imgs && imgs.length > 0) return (imgs[0] as ProductImage).image_url;
  return null;
}

function statusBadge(status: ReturnType<typeof getStockStatus>) {
  if (status === 'out_of_stock') return <Badge variant="error"><XCircle className="h-3 w-3" /> {STOCK_STATUS_LABEL[status]}</Badge>;
  if (status === 'low_stock') return <Badge variant="warning"><AlertTriangle className="h-3 w-3" /> {STOCK_STATUS_LABEL[status]}</Badge>;
  return <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> {STOCK_STATUS_LABEL[status]}</Badge>;
}

export function SellerInventoryPage() {
  const { user } = useAuth();
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [thresholdEdit, setThresholdEdit] = useState<InventoryItem | null>(null);
  const [thresholdValue, setThresholdValue] = useState('');

  useEffect(() => {
    (async () => {
      if (!user) { setLoading(false); return; }
      const { data: sp } = await supabase.from('seller_profiles').select('id').eq('user_id', user.id).maybeSingle();
      if (!sp) { setLoading(false); setError('No seller profile found.'); return; }
      setSellerId(sp.id);
      await loadInventory(sp.id);
    })();
  }, [user]);

  const loadInventory = async (sid: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSellerInventory(sid);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inventory could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const stats: InventoryStats = useMemo(() => {
    const published = items.filter((i) => i.product?.status === 'published');
    return {
      totalActive: published.length,
      totalUnits: items.reduce((sum, i) => sum + i.quantity, 0),
      lowStock: items.filter((i) => getStockStatus(i.quantity, i.low_stock_threshold) === 'low_stock').length,
      outOfStock: items.filter((i) => getStockStatus(i.quantity, i.low_stock_threshold) === 'out_of_stock').length,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (q && !(i.product?.title.toLowerCase().includes(q) || (i.product?.sku ?? '').toLowerCase().includes(q))) return false;
      if (statusFilter !== 'all') {
        return getStockStatus(i.quantity, i.low_stock_threshold) === statusFilter;
      }
      return true;
    });
  }, [items, search, statusFilter]);

  const openAdjust = (item: InventoryItem) => {
    setAdjustItem(item);
    setAdjustDelta('');
    setAdjustReason('');
  };

  const submitAdjust = async () => {
    if (!adjustItem) return;
    const delta = parseInt(adjustDelta, 10);
    if (isNaN(delta)) { return; }
    setBusy(true);
    try {
      await adjustStock(adjustItem.product_id, adjustItem.variant_id, delta, adjustReason.trim() || 'Manual adjustment');
      if (sellerId) await loadInventory(sellerId);
      setAdjustItem(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stock adjustment failed.');
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (item: InventoryItem) => {
    setHistoryItem(item);
    setHistoryLoading(true);
    try {
      const m = await fetchInventoryMovements(item.product_id, item.variant_id);
      setMovements(m);
    } catch {
      setMovements([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openThreshold = (item: InventoryItem) => {
    setThresholdEdit(item);
    setThresholdValue(String(item.low_stock_threshold));
  };

  const submitThreshold = async () => {
    if (!thresholdEdit) return;
    const t = parseInt(thresholdValue, 10);
    if (isNaN(t) || t < 0) return;
    setBusy(true);
    try {
      await updateLowStockThreshold(thresholdEdit.product_id, thresholdEdit.variant_id, t);
      if (sellerId) await loadInventory(sellerId);
      setThresholdEdit(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Threshold update failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="container-app py-12 animate-pulse"><div className="h-8 bg-cream-100 rounded w-1/3 mb-6" /><div className="grid grid-cols-4 gap-4 mb-6">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-cream-100 rounded-xl" />)}</div></div>;
  }

  if (error && items.length === 0) {
    return (
      <div className="container-app py-12">
        <EmptyState icon={<Package className="h-8 w-8" />} title="Inventory unavailable" description={error} action={<Button onClick={() => sellerId && loadInventory(sellerId)}>Try again</Button>} />
      </div>
    );
  }

  return (
    <div className="container-app py-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Inventory Management</h1>
          <p className="text-sm text-brand-500">Track stock, adjust quantities, and review movement history.</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/seller')}><TrendingUp className="h-4 w-4" /> Dashboard</Button>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<Package className="h-5 w-5" />} label="Active products" value={String(stats.totalActive)} />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Available units" value={String(stats.totalUnits)} />
        <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Low stock" value={String(stats.lowStock)} />
        <StatCard icon={<XCircle className="h-5 w-5" />} label="Out of stock" value={String(stats.outOfStock)} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by product name or SKU" className="pl-9" />
        </div>
        <div className="flex gap-1 bg-white border border-brand-100 rounded-lg p-1">
          {(['all', 'in_stock', 'low_stock', 'out_of_stock'] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${statusFilter === s ? 'bg-brand-600 text-white' : 'text-brand-600 hover:bg-brand-50'}`}>
              {s === 'all' ? 'All' : STOCK_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table / cards */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Package className="h-8 w-8" />} title={items.length === 0 ? 'No inventory yet' : 'No matches'} description={items.length === 0 ? 'Your products will appear here once you start tracking stock.' : 'Try a different search or filter.'} />
      ) : (
        <div className="bg-white rounded-xl border border-brand-100 overflow-hidden">
          {/* Desktop table */}
          <table className="hidden md:table w-full text-sm">
            <thead className="bg-cream-50 text-brand-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Variant</th>
                <th className="px-4 py-3 font-medium">Available</th>
                <th className="px-4 py-3 font-medium">Reserved</th>
                <th className="px-4 py-3 font-medium">Threshold</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-cream-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {productThumb(item) ? <img src={productThumb(item)!} alt="" className="h-10 w-10 rounded object-cover" /> : <div className="h-10 w-10 rounded bg-cream-100 flex items-center justify-center text-brand-400"><Package className="h-5 w-5" /></div>}
                      <div>
                        <button className="font-medium text-brand-900 hover:text-brand-700" onClick={() => navigate(`/product/${item.product_id}`)}>{item.product?.title ?? 'Unknown'}</button>
                        {item.product?.sku && <p className="text-xs text-brand-400">SKU: {item.product.sku}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-brand-600">{item.variant ? `${item.variant.name}: ${item.variant.value}` : '—'}</td>
                  <td className="px-4 py-3 font-semibold text-brand-900">{item.quantity}</td>
                  <td className="px-4 py-3 text-brand-500">{item.reserved}</td>
                  <td className="px-4 py-3"><button className="text-brand-600 hover:text-brand-800" onClick={() => openThreshold(item)}>{item.low_stock_threshold}</button></td>
                  <td className="px-4 py-3">{statusBadge(getStockStatus(item.quantity, item.low_stock_threshold))}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => openAdjust(item)}><Plus className="h-3 w-3" /> Adjust</Button>
                      <Button size="sm" variant="ghost" onClick={() => openHistory(item)}><History className="h-3 w-3" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-brand-50">
            {filtered.map((item) => (
              <div key={item.id} className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  {productThumb(item) ? <img src={productThumb(item)!} alt="" className="h-12 w-12 rounded object-cover" /> : <div className="h-12 w-12 rounded bg-cream-100 flex items-center justify-center text-brand-400"><Package className="h-6 w-6" /></div>}
                  <div className="flex-1 min-w-0">
                    <button className="font-medium text-brand-900 hover:text-brand-700 block truncate" onClick={() => navigate(`/product/${item.product_id}`)}>{item.product?.title ?? 'Unknown'}</button>
                    {item.variant && <p className="text-xs text-brand-500">{item.variant.name}: {item.variant.value}</p>}
                    {item.product?.sku && <p className="text-xs text-brand-400">SKU: {item.product.sku}</p>}
                  </div>
                  {statusBadge(getStockStatus(item.quantity, item.low_stock_threshold))}
                </div>
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-brand-500">Available: <strong className="text-brand-900">{item.quantity}</strong></span>
                  <span className="text-brand-500">Reserved: {item.reserved}</span>
                  <button className="text-brand-600 hover:text-brand-800" onClick={() => openThreshold(item)}>Threshold: {item.low_stock_threshold}</button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openAdjust(item)}><Plus className="h-3 w-3" /> Adjust</Button>
                  <Button size="sm" variant="ghost" onClick={() => openHistory(item)}><History className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Adjust modal */}
      <Modal open={!!adjustItem} onClose={() => setAdjustItem(null)} title={adjustItem ? `Adjust stock — ${adjustItem.product?.title}` : ''}>
        {adjustItem && (
          <div className="space-y-4">
            <p className="text-sm text-brand-500">Current available quantity: <strong className="text-brand-900">{adjustItem.quantity}</strong></p>
            <div>
              <label className="block text-sm font-medium text-brand-700 mb-1">Quantity change</label>
              <Input value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} placeholder="e.g. 10 to add 10, -5 to remove 5" type="number" />
              <p className="text-xs text-brand-400 mt-1">Use a positive number to add stock, a negative number to remove it.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-700 mb-1">Reason (optional)</label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Restock, damaged, correction, return..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setAdjustItem(null)}>Cancel</Button>
              <Button onClick={submitAdjust} disabled={busy || !adjustDelta}>{busy ? 'Saving...' : 'Apply adjustment'}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Threshold modal */}
      <Modal open={!!thresholdEdit} onClose={() => setThresholdEdit(null)} title="Low-stock threshold">
        {thresholdEdit && (
          <div className="space-y-4">
            <p className="text-sm text-brand-500">Set the quantity at which a low-stock alert is triggered for this product.</p>
            <Input value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} type="number" placeholder="e.g. 5" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setThresholdEdit(null)}>Cancel</Button>
              <Button onClick={submitThreshold} disabled={busy}>Save threshold</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* History modal */}
      <Modal open={!!historyItem} onClose={() => setHistoryItem(null)} title={historyItem ? `Stock history — ${historyItem.product?.title}` : ''}>
        {historyItem && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {historyLoading ? (
              <p className="text-sm text-brand-500">Loading...</p>
            ) : movements.length === 0 ? (
              <p className="text-sm text-brand-500">No inventory activity recorded yet.</p>
            ) : (
              movements.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-brand-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-brand-900 capitalize">{m.movement_type.replace(/_/g, ' ')}</p>
                    {m.reason && <p className="text-xs text-brand-500">{m.reason}</p>}
                    <p className="text-xs text-brand-400">{new Date(m.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${m.quantity_change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{m.quantity_change >= 0 ? '+' : ''}{m.quantity_change}</p>
                    <p className="text-xs text-brand-400">Now: {m.quantity_after}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-brand-100 p-4">
      <div className="flex items-center gap-2 text-brand-500 mb-1">{icon}<span className="text-xs font-medium">{label}</span></div>
      <p className="text-2xl font-bold text-brand-900">{value}</p>
    </div>
  );
}
