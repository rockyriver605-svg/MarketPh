/**
 * Seller Promotions management page.
 * Sellers create and manage promotional campaigns and coupon codes.
 * All data comes from real Supabase records — no fabricated promotions.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Plus, Tag, Ticket, TrendingUp, Pause, Play, Trash2, Pencil, X,
  Calendar, Percent, DollarSign, AlertCircle, BarChart3,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/ui/Input';
import {
  fetchSellerPromotions, fetchSellerCoupons, createPromotion, updatePromotion,
  deletePromotion, createCoupon, updateCoupon, deleteCoupon, fetchCouponRedemptions,
  PROMOTION_TYPE_LABELS, PROMOTION_STATUS_LABELS,
  type Promotion, type Coupon, type PromotionType, type PromotionStatus,
  type CouponDiscountType,
} from '@/lib/promotions';

type Tab = 'overview' | 'campaigns' | 'coupons' | 'redemptions';

export function SellerPromotionsPage() {
  const { user } = useAuth();
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [redemptions, setRedemptions] = useState<{ id: string; discount_amount: number; status: string; created_at: string; coupon?: { code: string } }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  const load = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError(null);
    try {
      const [promos, cps, reds] = await Promise.all([
        fetchSellerPromotions(sellerId),
        fetchSellerCoupons(sellerId),
        fetchCouponRedemptions(sellerId),
      ]);
      setPromotions(promos);
      setCoupons(cps);
      setRedemptions(reds as typeof redemptions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load promotions data.');
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    (async () => {
      if (!user) { setLoading(false); return; }
      const { data: sp } = await supabase
        .from('seller_profiles')
        .select('id, shop_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!sp) { setLoading(false); return; }
      setSellerId(sp.id as string);
      setShopName(sp.shop_name as string);
    })();
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const activePromos = promotions.filter((p) => p.status === 'active');
  const scheduledPromos = promotions.filter((p) => p.status === 'draft' && new Date(p.start_at) > new Date());
  const totalRedemptions = coupons.reduce((s, c) => s + c.total_redemptions, 0);

  if (loading && !sellerId) {
    return <div className="container-app py-12 animate-pulse"><div className="h-8 bg-cream-100 rounded w-1/3 mb-6" /></div>;
  }

  if (!sellerId) {
    return (
      <div className="container-app py-12">
        <EmptyState icon={<Tag className="h-8 w-8" />} title="No seller profile found" description="Set up your storefront to create promotions." action={<Button onClick={() => navigate('/seller/setup')}>Set Up Store</Button>} />
      </div>
    );
  }

  const togglePromoStatus = async (p: Promotion) => {
    const newStatus: PromotionStatus = p.status === 'active' ? 'paused' : 'active';
    try {
      await updatePromotion(p.id, { status: newStatus });
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update promotion.');
    }
  };

  const handleDeletePromo = async (p: Promotion) => {
    if (!confirm(`Delete campaign "${p.name}"? This cannot be undone.`)) return;
    try {
      await deletePromotion(p.id);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete promotion.');
    }
  };

  const toggleCouponStatus = async (c: Coupon) => {
    const newStatus = c.status === 'active' ? 'inactive' : 'active';
    try {
      await updateCoupon(c.id, { status: newStatus });
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update coupon.');
    }
  };

  const handleDeleteCoupon = async (c: Coupon) => {
    if (!confirm(`Delete coupon "${c.code}"? This cannot be undone.`)) return;
    try {
      await deleteCoupon(c.id);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete coupon.');
    }
  };

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/seller/dashboard')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <X className="h-4 w-4 rotate-45" /> Back to Dashboard
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Promotions & Coupons</h1>
          <p className="text-sm text-brand-500">{shopName}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { setEditingPromo(null); setShowPromoModal(true); }}>
            <Plus className="h-4 w-4" /> New Campaign
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setEditingCoupon(null); setShowCouponModal(true); }}>
            <Ticket className="h-4 w-4" /> New Coupon
          </Button>
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{error}</div>}

      <div className="flex gap-1 mb-6 border-b border-brand-100 overflow-x-auto">
        {(['overview', 'campaigns', 'coupons', 'redemptions'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t ? 'text-brand-700 border-brand-600' : 'text-brand-400 border-transparent hover:text-brand-600'}`}>
            {t}{t === 'redemptions' && totalRedemptions > 0 ? ` (${totalRedemptions})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-cream-100 rounded-xl animate-pulse" />)}</div>
      ) : tab === 'overview' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Active Campaigns" value={String(activePromos.length)} sub="currently running" />
            <StatCard icon={<Calendar className="h-5 w-5" />} label="Scheduled" value={String(scheduledPromos.length)} sub="draft / upcoming" />
            <StatCard icon={<Ticket className="h-5 w-5" />} label="Total Coupons" value={String(coupons.length)} sub={`${coupons.filter((c) => c.status === 'active').length} active`} />
            <StatCard icon={<Percent className="h-5 w-5" />} label="Redemptions" value={String(totalRedemptions)} sub="actual uses" />
          </div>

          {promotions.length === 0 && coupons.length === 0 ? (
            <EmptyState
              icon={<Tag className="h-8 w-8" />}
              title="No promotions yet"
              description="Create your first campaign or coupon to attract customers with discounts. All data comes from your real records — no sample promotions are shown."
              action={<Button onClick={() => { setEditingPromo(null); setShowPromoModal(true); }}><Plus className="h-4 w-4" /> Create Campaign</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-brand-100 p-5">
                <h2 className="text-sm font-semibold text-brand-900 mb-3">Recent Campaigns</h2>
                {activePromos.length === 0 ? <p className="text-sm text-brand-400">No active campaigns.</p> : (
                  <div className="space-y-2">
                    {promotions.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-2 border-b border-brand-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-brand-900">{p.name}</p>
                          <p className="text-xs text-brand-400">{PROMOTION_TYPE_LABELS[p.type]} · {formatDate(p.start_at)} – {formatDate(p.end_at)}</p>
                        </div>
                        <Badge variant={p.status === 'active' ? 'success' : 'default'}>{PROMOTION_STATUS_LABELS[p.status]}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-brand-100 p-5">
                <h2 className="text-sm font-semibold text-brand-900 mb-3">Recent Coupons</h2>
                {coupons.length === 0 ? <p className="text-sm text-brand-400">No coupons created.</p> : (
                  <div className="space-y-2">
                    {coupons.slice(0, 5).map((c) => (
                      <div key={c.id} className="flex items-center justify-between py-2 border-b border-brand-50 last:border-0">
                        <div>
                          <p className="text-sm font-mono font-semibold text-brand-900">{c.code}</p>
                          <p className="text-xs text-brand-400">{c.discount_type === 'percentage' ? `${c.discount_value}% off` : `${formatCurrency(c.discount_value)} off`} · {c.total_redemptions} uses</p>
                        </div>
                        <Badge variant={c.status === 'active' ? 'success' : 'default'}>{c.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : tab === 'campaigns' ? (
        promotions.length === 0 ? (
          <EmptyState icon={<Tag className="h-8 w-8" />} title="No campaigns yet" description="Create a promotional campaign to offer discounts on your products." action={<Button onClick={() => { setEditingPromo(null); setShowPromoModal(true); }}><Plus className="h-4 w-4" /> New Campaign</Button>} />
        ) : (
          <div className="space-y-3">
            {promotions.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-brand-100 p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-brand-900">{p.name}</h3>
                      <Badge variant={p.status === 'active' ? 'success' : p.status === 'paused' ? 'warning' : 'default'}>{PROMOTION_STATUS_LABELS[p.status]}</Badge>
                    </div>
                    <p className="text-xs text-brand-500 mb-2">{PROMOTION_TYPE_LABELS[p.type]} · {p.discount_value}{p.type === 'percentage' || p.type === 'product_specific' || p.type === 'storewide' || p.type === 'buy_more_save_more' || p.type === 'bundle' ? '%' : ''} off</p>
                    <div className="flex flex-wrap gap-3 text-xs text-brand-400">
                      <span><Calendar className="inline h-3 w-3 mr-1" />{formatDate(p.start_at)} – {formatDate(p.end_at)}</span>
                      <span><DollarSign className="inline h-3 w-3 mr-1" />Min: {formatCurrency(p.min_purchase)}</span>
                      {p.max_redemptions && <span>Max: {p.max_redemptions} uses</span>}
                      <span>{p.total_redemptions} redeemed</span>
                    </div>
                    {p.description && <p className="text-sm text-brand-600 mt-2">{p.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { setEditingPromo(p); setShowPromoModal(true); }} className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => togglePromoStatus(p)} className="p-2 rounded-lg text-brand-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" aria-label="Toggle">{p.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
                    <button onClick={() => handleDeletePromo(p)} className="p-2 rounded-lg text-brand-400 hover:text-red-600 hover:bg-red-50 transition-colors" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'coupons' ? (
        coupons.length === 0 ? (
          <EmptyState icon={<Ticket className="h-8 w-8" />} title="No coupons yet" description="Create coupon codes that buyers can apply at checkout." action={<Button variant="outline" onClick={() => { setEditingCoupon(null); setShowCouponModal(true); }}><Plus className="h-4 w-4" /> New Coupon</Button>} />
        ) : (
          <div className="space-y-3">
            {coupons.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-brand-100 p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-sm font-mono font-bold text-brand-900 bg-cream-100 px-2 py-0.5 rounded">{c.code}</code>
                      <Badge variant={c.status === 'active' ? 'success' : 'default'}>{c.status}</Badge>
                    </div>
                    <p className="text-xs text-brand-500 mb-2">{c.discount_type === 'percentage' ? `${c.discount_value}% off` : `${formatCurrency(c.discount_value)} off`} · Min: {formatCurrency(c.min_purchase)}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-brand-400">
                      <span><Calendar className="inline h-3 w-3 mr-1" />{formatDate(c.start_at)} – {formatDate(c.end_at)}</span>
                      <span>{c.total_redemptions}{c.max_redemptions ? ` / ${c.max_redemptions}` : ''} used</span>
                      <span>{c.per_buyer_limit} per buyer</span>
                    </div>
                    {c.description && <p className="text-sm text-brand-600 mt-2">{c.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { setEditingCoupon(c); setShowCouponModal(true); }} className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => toggleCouponStatus(c)} className="p-2 rounded-lg text-brand-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" aria-label="Toggle">{c.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
                    <button onClick={() => handleDeleteCoupon(c)} className="p-2 rounded-lg text-brand-400 hover:text-red-600 hover:bg-red-50 transition-colors" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        redemptions.length === 0 ? (
          <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="No redemptions yet" description="When buyers use your coupons at checkout, redemption records will appear here." />
        ) : (
          <div className="bg-white rounded-xl border border-brand-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-cream-50 text-brand-500 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Coupon</th>
                    <th className="px-4 py-3 font-medium text-right">Discount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-50">
                  {redemptions.map((r) => (
                    <tr key={r.id} className="hover:bg-cream-50/50">
                      <td className="px-4 py-3 font-mono text-brand-900">{r.coupon?.code ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-brand-900">{formatCurrency(r.discount_amount)}</td>
                      <td className="px-4 py-3"><Badge variant={r.status === 'redeemed' ? 'success' : 'default'}>{r.status}</Badge></td>
                      <td className="px-4 py-3 text-brand-400">{formatDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {showPromoModal && (
        <PromotionModal
          sellerId={sellerId}
          existing={editingPromo}
          onClose={() => setShowPromoModal(false)}
          onSaved={() => { setShowPromoModal(false); void load(); }}
        />
      )}

      {showCouponModal && (
        <CouponModal
          sellerId={sellerId}
          promotions={promotions}
          existing={editingCoupon}
          onClose={() => setShowCouponModal(false)}
          onSaved={() => { setShowCouponModal(false); void load(); }}
        />
      )}
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

function PromotionModal({ sellerId, existing, onClose, onSaved }: {
  sellerId: string;
  existing: Promotion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [type, setType] = useState<PromotionType>(existing?.type ?? 'percentage');
  const [discountValue, setDiscountValue] = useState(String(existing?.discount_value ?? 10));
  const [minPurchase, setMinPurchase] = useState(String(existing?.min_purchase ?? 0));
  const [maxDiscount, setMaxDiscount] = useState(existing?.max_discount?.toString() ?? '');
  const [maxRedemptions, setMaxRedemptions] = useState(existing?.max_redemptions?.toString() ?? '');
  const [perBuyerLimit, setPerBuyerLimit] = useState(String(existing?.per_buyer_limit ?? 1));
  const [startAt, setStartAt] = useState(existing?.start_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [endAt, setEndAt] = useState(existing?.end_at?.slice(0, 10) ?? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [visibility, setVisibility] = useState<'public' | 'storefront_only'>(existing?.visibility ?? 'public');
  const [terms, setTerms] = useState(existing?.terms ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) { setErr('Campaign name is required.'); return; }
    if (new Date(endAt) <= new Date(startAt)) { setErr('End date must be after start date.'); return; }
    const dv = Number(discountValue);
    if (Number.isNaN(dv) || dv < 0) { setErr('Discount value must be a valid number.'); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        type,
        discount_value: dv,
        min_purchase: Number(minPurchase) || 0,
        max_discount: maxDiscount ? Number(maxDiscount) : null,
        max_redemptions: maxRedemptions ? Number(maxRedemptions) : null,
        per_buyer_limit: Number(perBuyerLimit) || 1,
        start_at: new Date(`${startAt}T00:00:00+08:00`).toISOString(),
        end_at: new Date(`${endAt}T23:59:59+08:00`).toISOString(),
        status: existing?.status ?? 'active' as PromotionStatus,
        visibility,
        terms: terms.trim() || null,
        municipality_id: null,
      };
      if (existing) {
        await updatePromotion(existing.id, payload);
      } else {
        await createPromotion(sellerId, payload);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save campaign.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={existing ? 'Edit Campaign' : 'New Promotional Campaign'} size="lg">
      <div className="space-y-4">
        {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700"><AlertCircle className="inline h-4 w-4 mr-1" />{err}</div>}
        <Input label="Campaign Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Sale" />
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this promotion offer?" rows={2} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-brand-500 mb-1">Promotion Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as PromotionType)} className="w-full h-9 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900">
              {Object.entries(PROMOTION_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Input label={type === 'fixed_amount' ? 'Discount Amount (PHP)' : 'Discount Value'} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Min Purchase (PHP)" value={minPurchase} onChange={(e) => setMinPurchase(e.target.value)} type="number" />
          <Input label="Max Discount (PHP, optional)" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} type="number" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Max Redemptions" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} type="number" placeholder="Unlimited" />
          <Input label="Per-Buyer Limit" value={perBuyerLimit} onChange={(e) => setPerBuyerLimit(e.target.value)} type="number" />
          <div>
            <label className="block text-xs font-medium text-brand-500 mb-1">Visibility</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'storefront_only')} className="w-full h-9 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900">
              <option value="public">Public</option>
              <option value="storefront_only">Storefront Only</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start Date" value={startAt} onChange={(e) => setStartAt(e.target.value)} type="date" />
          <Input label="End Date" value={endAt} onChange={(e) => setEndAt(e.target.value)} type="date" />
        </div>
        <Textarea label="Terms & Conditions" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Optional terms buyers should know" rows={2} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>{existing ? 'Save Changes' : 'Create Campaign'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function CouponModal({ sellerId, promotions, existing, onClose, onSaved }: {
  sellerId: string;
  promotions: Promotion[];
  existing: Coupon | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(existing?.code ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [discountType, setDiscountType] = useState<CouponDiscountType>(existing?.discount_type ?? 'percentage');
  const [discountValue, setDiscountValue] = useState(String(existing?.discount_value ?? 10));
  const [minPurchase, setMinPurchase] = useState(String(existing?.min_purchase ?? 0));
  const [maxDiscount, setMaxDiscount] = useState(existing?.max_discount?.toString() ?? '');
  const [startAt, setStartAt] = useState(existing?.start_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [endAt, setEndAt] = useState(existing?.end_at?.slice(0, 10) ?? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [maxRedemptions, setMaxRedemptions] = useState(existing?.max_redemptions?.toString() ?? '');
  const [perBuyerLimit, setPerBuyerLimit] = useState(String(existing?.per_buyer_limit ?? 1));
  const [promotionId, setPromotionId] = useState(existing?.promotion_id ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!code.trim()) { setErr('Coupon code is required.'); return; }
    if (!/^[A-Za-z0-9_]{3,30}$/.test(code.trim())) { setErr('Code must be 3-30 letters, numbers, or underscores.'); return; }
    if (new Date(endAt) <= new Date(startAt)) { setErr('End date must be after start date.'); return; }
    const dv = Number(discountValue);
    if (Number.isNaN(dv) || dv < 0) { setErr('Discount value must be valid.'); return; }
    if (discountType === 'percentage' && dv > 100) { setErr('Percentage discount cannot exceed 100%.'); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        description: description.trim() || null,
        discount_type: discountType,
        discount_value: dv,
        min_purchase: Number(minPurchase) || 0,
        max_discount: maxDiscount ? Number(maxDiscount) : null,
        start_at: new Date(`${startAt}T00:00:00+08:00`).toISOString(),
        end_at: new Date(`${endAt}T23:59:59+08:00`).toISOString(),
        max_redemptions: maxRedemptions ? Number(maxRedemptions) : null,
        per_buyer_limit: Number(perBuyerLimit) || 1,
        status: existing?.status ?? 'active' as const,
        promotion_id: promotionId || null,
      };
      if (existing) {
        await updateCoupon(existing.id, payload);
      } else {
        await createCoupon(sellerId, payload);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save coupon.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={existing ? 'Edit Coupon' : 'New Coupon Code'} size="lg">
      <div className="space-y-4">
        {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700"><AlertCircle className="inline h-4 w-4 mr-1" />{err}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Coupon Code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SAVE50" />
          <div>
            <label className="block text-xs font-medium text-brand-500 mb-1">Link to Campaign (optional)</label>
            <select value={promotionId} onChange={(e) => setPromotionId(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900">
              <option value="">Standalone coupon</option>
              {promotions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this coupon offer?" rows={2} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-brand-500 mb-1">Discount Type</label>
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value as CouponDiscountType)} className="w-full h-9 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900">
              <option value="percentage">Percentage</option>
              <option value="fixed_amount">Fixed Amount</option>
            </select>
          </div>
          <Input label={discountType === 'percentage' ? 'Discount %' : 'Discount (PHP)'} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Min Purchase (PHP)" value={minPurchase} onChange={(e) => setMinPurchase(e.target.value)} type="number" />
          <Input label="Max Discount (PHP, optional)" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Max Redemptions" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} type="number" placeholder="Unlimited" />
          <Input label="Per-Buyer Limit" value={perBuyerLimit} onChange={(e) => setPerBuyerLimit(e.target.value)} type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start Date" value={startAt} onChange={(e) => setStartAt(e.target.value)} type="date" />
          <Input label="End Date" value={endAt} onChange={(e) => setEndAt(e.target.value)} type="date" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>{existing ? 'Save Changes' : 'Create Coupon'}</Button>
        </div>
      </div>
    </Modal>
  );
}
