/**
 * Buyer-facing Promotions discovery page.
 * Shows active public promotions and coupons from real MariMarket sellers.
 * Buyers can save coupons and copy codes. No fabricated deals.
 */

import { useCallback, useEffect, useState } from 'react';
import { Ticket, Tag, MapPin, Copy, Check, Bookmark, BookmarkCheck, Calendar, Store, Percent } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  fetchActivePublicPromotions, fetchActivePublicCoupons, fetchSavedCouponIds,
  saveCoupon, unsaveCoupon,
  PROMOTION_TYPE_LABELS,
  type Promotion, type CouponWithSeller,
} from '@/lib/promotions';

export function PromotionsPage() {
  const { user } = useAuth();
  const [promotions, setPromotions] = useState<(Promotion & { seller?: { shop_name: string; slug: string } })[]>([]);
  const [coupons, setCoupons] = useState<CouponWithSeller[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [municipalityFilter, setMunicipalityFilter] = useState('');
  const [municipalities, setMunicipalities] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [promos, cps, muns] = await Promise.all([
        fetchActivePublicPromotions(municipalityFilter || undefined),
        fetchActivePublicCoupons(),
        supabase.from('municipalities').select('id, name').order('name'),
      ]);
      setPromotions(promos);
      setCoupons(cps);
      setMunicipalities((muns.data ?? []) as { id: string; name: string }[]);
      if (user) {
        const saved = await fetchSavedCouponIds(user.id);
        setSavedIds(saved);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load promotions.');
    } finally {
      setLoading(false);
    }
  }, [municipalityFilter, user]);

  useEffect(() => { void load(); }, [load]);

  const handleCopy = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleSave = async (couponId: string) => {
    if (!user) { navigate('/signin'); return; }
    const isSaved = savedIds.has(couponId);
    try {
      if (isSaved) {
        await unsaveCoupon(user.id, couponId);
        setSavedIds((prev) => { const n = new Set(prev); n.delete(couponId); return n; });
      } else {
        await saveCoupon(user.id, couponId);
        setSavedIds((prev) => new Set(prev).add(couponId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update saved coupons.');
    }
  };

  return (
    <div className="container-app py-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-900 mb-1">Local Deals & Promotions</h1>
        <p className="text-sm text-brand-500">Active offers from MariMarket sellers across Marinduque.</p>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{error}</div>}

      {/* Municipality filter */}
      <div className="flex items-center gap-2 mb-6">
        <MapPin className="h-4 w-4 text-brand-400" />
        <select value={municipalityFilter} onChange={(e) => setMunicipalityFilter(e.target.value)} className="h-9 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900">
          <option value="">All Municipalities</option>
          {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-48 bg-cream-100 rounded-xl animate-pulse" />)}</div>
      ) : promotions.length === 0 && coupons.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-8 w-8" />}
          title="No active promotions right now"
          description="When sellers create campaigns and coupons, they'll appear here. Check back soon for local deals across Marinduque."
        />
      ) : (
        <div className="space-y-8">
          {/* Promotions */}
          {promotions.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-brand-900 mb-3 flex items-center gap-1.5"><Tag className="h-4 w-4 text-brand-500" /> Active Campaigns</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {promotions.map((p) => (
                  <div key={p.id} className="bg-white rounded-xl border border-brand-100 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                        <Percent className="h-5 w-5" />
                      </div>
                      <Badge variant="success">Active</Badge>
                    </div>
                    <h3 className="text-sm font-semibold text-brand-900 mb-1">{p.name}</h3>
                    <p className="text-xs text-brand-500 mb-3">{PROMOTION_TYPE_LABELS[p.type]} · {p.discount_value}{p.type === 'percentage' || p.type === 'product_specific' || p.type === 'storewide' || p.type === 'buy_more_save_more' || p.type === 'bundle' ? '%' : ''} off</p>
                    {p.description && <p className="text-sm text-brand-600 mb-3 line-clamp-2">{p.description}</p>}
                    <div className="flex items-center gap-3 text-xs text-brand-400 mb-3">
                      <span><Calendar className="inline h-3 w-3 mr-1" />Until {formatDate(p.end_at)}</span>
                    </div>
                    {p.seller && (
                      <button onClick={() => navigate(`/seller/${p.seller!.slug}`)} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800 transition-colors">
                        <Store className="h-3 w-3" /> {p.seller.shop_name}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coupons */}
          {coupons.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-brand-900 mb-3 flex items-center gap-1.5"><Ticket className="h-4 w-4 text-brand-500" /> Available Coupons</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {coupons.map((c) => (
                  <div key={c.id} className="bg-white rounded-xl border border-brand-100 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <code className="text-sm font-mono font-bold text-brand-900 bg-cream-100 px-3 py-1.5 rounded-lg">{c.code}</code>
                      <button onClick={() => handleSave(c.id)} className="p-1.5 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors" aria-label={savedIds.has(c.id) ? 'Unsave' : 'Save'}>
                        {savedIds.has(c.id) ? <BookmarkCheck className="h-5 w-5 text-brand-600" /> : <Bookmark className="h-5 w-5" />}
                      </button>
                    </div>
                    <p className="text-sm font-medium text-brand-900 mb-1">
                      {c.discount_type === 'percentage' ? `${c.discount_value}% off` : `${formatCurrency(c.discount_value)} off`}
                    </p>
                    {c.description && <p className="text-xs text-brand-600 mb-3">{c.description}</p>}
                    <div className="flex flex-wrap gap-2 text-xs text-brand-400 mb-3">
                      <span><Calendar className="inline h-3 w-3 mr-1" />Until {formatDate(c.end_at)}</span>
                      {c.min_purchase > 0 && <span>Min: {formatCurrency(c.min_purchase)}</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      {c.seller && (
                        <button onClick={() => navigate(`/seller/${c.seller!.slug}`)} className="text-xs font-medium text-brand-600 hover:text-brand-800 transition-colors">
                          {c.seller.shop_name}
                        </button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleCopy(c.code)}>
                        {copiedCode === c.code ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
