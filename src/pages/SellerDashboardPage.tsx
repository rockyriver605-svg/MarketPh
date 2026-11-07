import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Package, Plus, Store, DollarSign, TrendingUp, AlertCircle, Search,
  Pencil, Eye, Pause, Archive, RotateCcw, ShoppingCart, Tag,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { SellerProfile, Product, OrderItem, ProductStatus, ProductWithRelations } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency, formatDate } from '@/lib/utils';

const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending Review',
  published: 'Published',
  rejected: 'Rejected',
  paused: 'Paused',
  sold_out: 'Sold Out',
  archived: 'Archived',
};

const STATUS_VARIANTS: Record<ProductStatus, 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent' | 'brand'> = {
  draft: 'default',
  pending_review: 'warning',
  published: 'success',
  rejected: 'error',
  paused: 'info',
  sold_out: 'warning',
  archived: 'default',
};

export function SellerDashboardPage() {
  const { user } = useAuth();
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [products, setProducts] = useState<ProductWithRelations[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders' | 'offers'>('overview');
  const [pendingOffers, setPendingOffers] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductStatus | 'all'>('all');
  const [actionProduct, setActionProduct] = useState<Product | null>(null);
  const [actionType, setActionType] = useState<'archive' | 'delete' | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: sellerData } = await supabase
      .from('seller_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setSeller(sellerData as SellerProfile | null);

    if (sellerData) {
      const [{ data: prodData }, { data: oiData }, { count: offerCount }] = await Promise.all([
        supabase.from('products')
          .select('*, seller:seller_profiles(*), category:categories(*), municipality:municipalities(*), barangay:barangays(*), product_images(*), product_variants(*)')
          .eq('seller_id', sellerData.id)
          .order('created_at', { ascending: false }),
        supabase.from('order_items').select('*').eq('seller_id', sellerData.id).order('created_at', { ascending: false }),
        supabase.from('product_offers').select('*', { count: 'exact', head: true }).eq('seller_id', sellerData.id).eq('status', 'pending'),
      ]);
      setProducts(prodData as ProductWithRelations[] ?? []);
      setOrderItems(oiData as OrderItem[] ?? []);
      setPendingOffers(offerCount ?? 0);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (statusFilter !== 'all') list = list.filter((p) => p.status === statusFilter);
    const term = search.trim().toLowerCase();
    if (term) list = list.filter((p) => p.title.toLowerCase().includes(term));
    return list;
  }, [products, statusFilter, search]);

  const stats = useMemo(() => ({
    total: products.length,
    published: products.filter((p) => p.status === 'published').length,
    pending: products.filter((p) => p.status === 'pending_review' || p.status === 'draft').length,
    rejected: products.filter((p) => p.status === 'rejected').length,
    lowStock: products.filter((p) => p.stock > 0 && p.stock <= 3).length,
    outOfStock: products.filter((p) => p.stock === 0).length,
  }), [products]);

  const totalRevenue = orderItems.reduce((sum, oi) => sum + Number(oi.subtotal), 0);

  const updateStatus = async (product: Product, newStatus: ProductStatus) => {
    setError(null);
    const { error: err } = await supabase.from('products').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', product.id);
    if (err) {
      setError('Could not update listing status. Try again.');
      return;
    }
    setNotice(`${product.title} is now ${STATUS_LABELS[newStatus]}.`);
    load();
  };

  const openAction = (product: Product, type: 'archive' | 'delete') => {
    setActionProduct(product);
    setActionType(type);
    setError(null);
  };

  const confirmAction = async () => {
    if (!actionProduct || !actionType) return;
    setActionBusy(true);
    if (actionType === 'archive') {
      await updateStatus(actionProduct, 'archived');
    } else if (actionType === 'delete') {
      await supabase.from('product_images').delete().eq('product_id', actionProduct.id);
      const { error: delErr } = await supabase.from('products').delete().eq('id', actionProduct.id);
      if (delErr) {
        setError('Could not delete this product. It may have active orders.');
      } else {
        setNotice(`"${actionProduct.title}" was deleted.`);
        load();
      }
    }
    setActionBusy(false);
    setActionProduct(null);
    setActionType(null);
  };

  if (!user) return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  if (loading) return <div className="container-app py-12 animate-pulse"><div className="h-8 bg-cream-100 rounded w-1/3" /></div>;
  if (!seller) {
    return (
      <div className="container-app py-12">
        <EmptyState
          icon={<Store className="h-8 w-8" />}
          title="No seller profile yet"
          description="Create your storefront to start selling on MariMarket."
          action={<Button onClick={() => navigate('/seller/setup')}>Set Up Store</Button>}
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Seller Dashboard</h1>
          <p className="text-sm text-brand-500">{seller.shop_name}</p>
        </div>
        <Button onClick={() => navigate('/seller/products/new')}>
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      </div>

      {notice && <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-800">{notice}</div>}
      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{error}</div>}

      <div className="flex gap-1 mb-6 border-b border-brand-100">
        {(['overview', 'products', 'orders', 'offers'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors capitalize border-b-2 -mb-px ${
              activeTab === tab ? 'text-brand-700 border-brand-600' : 'text-brand-400 border-transparent hover:text-brand-600'
            }`}
          >
            {tab}{tab === 'offers' && pendingOffers > 0 ? ` (${pendingOffers})` : ''}
          </button>
        ))}
        <button
          onClick={() => navigate('/seller/reviews')}
          className="ml-auto px-4 py-2.5 text-sm font-medium text-brand-600 hover:text-brand-800 transition-colors"
        >
          Reviews
        </button>
        <button
          onClick={() => navigate('/seller/inventory')}
          className="px-4 py-2.5 text-sm font-medium text-brand-600 hover:text-brand-800 transition-colors"
        >
          Inventory
        </button>
        <button
          onClick={() => navigate('/seller/analytics')}
          className="px-4 py-2.5 text-sm font-medium text-brand-600 hover:text-brand-800 transition-colors"
        >
          Analytics
        </button>
        <button
          onClick={() => navigate('/seller/promotions')}
          className="px-4 py-2.5 text-sm font-medium text-brand-600 hover:text-brand-800 transition-colors"
        >
          Promotions
        </button>
        <button
          onClick={() => navigate('/seller/tools')}
          className="px-4 py-2.5 text-sm font-medium text-brand-600 hover:text-brand-800 transition-colors"
        >
          Business Tools
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard icon={<Package className="h-5 w-5" />} label="Total Products" value={String(stats.total)} sub={`${stats.published} published`} />
          <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Published" value={String(stats.published)} sub="live listings" />
          <StatCard icon={<AlertCircle className="h-5 w-5" />} label="Drafts" value={String(stats.pending)} sub="not yet live" />
          {stats.rejected > 0 && <StatCard icon={<AlertCircle className="h-5 w-5" />} label="Rejected" value={String(stats.rejected)} sub="needs revision" />}
          <StatCard icon={<DollarSign className="h-5 w-5" />} label="Revenue" value={formatCurrency(totalRevenue)} sub="from all orders" />
          <StatCard icon={<ShoppingCart className="h-5 w-5" />} label="Orders" value={String(orderItems.length)} sub="total items sold" />
        </div>
      )}

      {activeTab === 'products' && (
        <div>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ProductStatus | 'all')}
              className="h-10 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="paused">Paused</option>
              <option value="sold_out">Sold Out</option>
              <option value="archived">Archived</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {filteredProducts.length > 0 ? (
            <div className="space-y-3">
              {filteredProducts.map((product) => {
                const primaryImage = product.product_images?.find((img) => img.is_primary) ?? product.product_images?.[0];
                const effectivePrice = product.sale_price ?? product.price;
                return (
                  <div key={product.id} className="bg-white rounded-xl border border-brand-100 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-14 w-14 rounded-lg bg-cream-100 overflow-hidden shrink-0">
                        {primaryImage ? (
                          <img src={primaryImage.image_url} alt={product.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Package className="h-6 w-6 text-brand-300" /></div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <button onClick={() => navigate(`/product/${product.id}`)} className="text-sm font-semibold text-brand-900 hover:text-brand-600 truncate block text-left">
                          {product.title}
                        </button>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant={STATUS_VARIANTS[product.status]}>{STATUS_LABELS[product.status]}</Badge>
                          <span className="text-xs text-brand-400">{formatCurrency(effectivePrice)} · {product.stock} in stock</span>
                          {product.stock <= 3 && product.stock > 0 && <span className="text-xs text-amber-600 font-medium">Low stock</span>}
                          {product.stock === 0 && <span className="text-xs text-red-600 font-medium">Out of stock</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => navigate(`/seller/products/${product.id}/edit`)} aria-label="Edit" className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      {product.status === 'published' && (
                        <button onClick={() => updateStatus(product, 'paused')} aria-label="Pause" title="Pause listing" className="p-2 rounded-lg text-brand-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                          <Pause className="h-4 w-4" />
                        </button>
                      )}
                      {product.status === 'paused' && (
                        <button onClick={() => updateStatus(product, 'published')} aria-label="Resume" title="Resume listing" className="p-2 rounded-lg text-brand-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      {(product.status === 'draft' || product.status === 'rejected') && (
                        <button onClick={() => updateStatus(product, 'published')} aria-label="Publish" title="Publish listing" className="p-2 rounded-lg text-brand-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      {product.status !== 'archived' && (
                        <button onClick={() => openAction(product, 'archive')} aria-label="Archive" title="Archive listing" className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors">
                          <Archive className="h-4 w-4" />
                        </button>
                      )}
                      {product.status === 'archived' && (
                        <button onClick={() => updateStatus(product, 'draft')} aria-label="Restore" title="Restore to draft" className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors">
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title={products.length === 0 ? 'No products yet' : 'No matching products'}
              description={products.length === 0 ? 'Add your first product to start selling.' : 'Try a different search or filter.'}
              action={products.length === 0 ? <Button onClick={() => navigate('/seller/products/new')}>Add Product</Button> : undefined}
            />
          )}
        </div>
      )}

      {activeTab === 'orders' && (
        <div>
          {orderItems.length > 0 ? (
            <div className="space-y-3">
              {orderItems.map((oi) => (
                <div key={oi.id} className="bg-white rounded-xl border border-brand-100 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-brand-900">{oi.product_title}</p>
                      <p className="text-xs text-brand-500 mt-1">{oi.quantity} x {formatCurrency(oi.unit_price)} = {formatCurrency(oi.subtotal)}</p>
                      <p className="text-xs text-brand-400 mt-1">{formatDate(oi.created_at)}</p>
                    </div>
                    <Badge variant="info">{oi.quantity} item{oi.quantity !== 1 ? 's' : ''}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<AlertCircle className="h-8 w-8" />}
              title="No orders yet"
              description="Orders from buyers will appear here once you start selling."
              action={<Button onClick={() => navigate('/seller/orders')}>Go to Order Management</Button>}
            />
          )}
        </div>
      )}

      {activeTab === 'offers' && (
        <div>
          {pendingOffers > 0 ? (
            <div className="bg-white rounded-xl border border-brand-100 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent-50 text-accent-600 mx-auto mb-4">
                <Tag className="h-7 w-7" />
              </div>
              <p className="text-lg font-semibold text-brand-900 mb-1">{pendingOffers} pending offer{pendingOffers !== 1 ? 's' : ''}</p>
              <p className="text-sm text-brand-500 mb-4">Buyers are waiting for your response on their price offers.</p>
              <Button onClick={() => navigate('/offers')}>View All Offers</Button>
            </div>
          ) : (
            <EmptyState
              icon={<Tag className="h-8 w-8" />}
              title="No pending offers"
              description="When buyers make price offers on your products, they'll appear here for you to accept, reject, or counter."
              action={<Button variant="outline" onClick={() => navigate('/offers')}>View Offer History</Button>}
            />
          )}
        </div>
      )}

      <Modal open={actionProduct !== null && actionType === 'archive'} onClose={() => { setActionProduct(null); setActionType(null); }} title="Archive listing" size="sm">
        <p className="text-sm text-brand-600 mb-5">
          Archive "{actionProduct?.title}"? It will be hidden from buyers but kept in your records. You can restore it to draft later.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { setActionProduct(null); setActionType(null); }}>Cancel</Button>
          <Button onClick={confirmAction} loading={actionBusy}>Archive</Button>
        </div>
      </Modal>

      <Modal open={actionProduct !== null && actionType === 'delete'} onClose={() => { setActionProduct(null); setActionType(null); }} title="Delete listing" size="sm">
        <p className="text-sm text-brand-600 mb-5">
          Permanently delete "{actionProduct?.title}"? This removes the listing and all images. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { setActionProduct(null); setActionType(null); }}>Cancel</Button>
          <Button variant="danger" onClick={confirmAction} loading={actionBusy}>Delete permanently</Button>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-brand-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</div>
        <span className="text-xs font-medium text-brand-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-brand-900">{value}</p>
      <p className="text-xs text-brand-400 mt-0.5">{sub}</p>
    </div>
  );
}
