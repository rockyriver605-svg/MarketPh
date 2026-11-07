import { useCallback, useEffect, useState } from 'react';
import {
  Tag, Clock, Check, X, ArrowLeft, MessageCircle, TrendingDown, Send,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { ProductOfferWithRelations, SellerProfile, Profile } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/ui/Input';
import { formatCurrency, formatDate } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { variant: 'default' | 'success' | 'warning' | 'error' | 'info'; label: string }> = {
  pending: { variant: 'warning', label: 'Pending' },
  accepted: { variant: 'success', label: 'Accepted' },
  rejected: { variant: 'error', label: 'Rejected' },
  withdrawn: { variant: 'default', label: 'Withdrawn' },
  expired: { variant: 'info', label: 'Expired' },
};

export function OffersPage() {
  const { user } = useAuth();
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [sentOffers, setSentOffers] = useState<ProductOfferWithRelations[]>([]);
  const [receivedOffers, setReceivedOffers] = useState<ProductOfferWithRelations[]>([]);
  const [buyers, setBuyers] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const [counterOpen, setCounterOpen] = useState<ProductOfferWithRelations | null>(null);
  const [counterPrice, setCounterPrice] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: sellerData } = await supabase
      .from('seller_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setSeller(sellerData as SellerProfile | null);

    const [sentRes, receivedRes] = await Promise.all([
      supabase
        .from('product_offers')
        .select(`
          *,
          product:products(*, seller:seller_profiles(*), category:categories(*), municipality:municipalities(*), barangay:barangays(*), product_images(*), product_variants(*))
        `)
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false }),
      sellerData
        ? supabase
            .from('product_offers')
            .select(`
              *,
              product:products(*, seller:seller_profiles(*), category:categories(*), municipality:municipalities(*), barangay:barangays(*), product_images(*), product_variants(*))
            `)
            .eq('seller_id', sellerData.id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: null, error: null }),
    ]);

    setSentOffers((sentRes.data as ProductOfferWithRelations[]) ?? []);
    setReceivedOffers((receivedRes.data as ProductOfferWithRelations[]) ?? []);

    const buyerIds = [...new Set(((receivedRes.data as ProductOfferWithRelations[]) ?? []).map((o) => o.buyer_id))];
    if (buyerIds.length > 0) {
      const { data: buyerData } = await supabase.from('profiles').select('*').in('id', buyerIds);
      const map: Record<string, Profile> = {};
      (buyerData as Profile[] | null)?.forEach((p) => { map[p.id] = p; });
      setBuyers(map);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleAccept = async (offer: ProductOfferWithRelations) => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('product_offers')
      .update({ status: 'accepted', seller_message: 'Offer accepted.' })
      .eq('id', offer.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    setNotice(`Offer from ${buyers[offer.buyer_id]?.display_name ?? 'buyer'} accepted.`);
    load();
  };

  const handleReject = async (offer: ProductOfferWithRelations) => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('product_offers')
      .update({ status: 'rejected', seller_message: 'Offer rejected.' })
      .eq('id', offer.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    setNotice('Offer rejected.');
    load();
  };

  const handleWithdraw = async (offer: ProductOfferWithRelations) => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('product_offers')
      .update({ status: 'withdrawn' })
      .eq('id', offer.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    setNotice('Offer withdrawn.');
    load();
  };

  const openCounter = (offer: ProductOfferWithRelations) => {
    setCounterOpen(offer);
    setCounterPrice(String(offer.product?.price ?? offer.proposed_price));
    setCounterMessage('');
    setError(null);
  };

  const handleCounter = async () => {
    if (!counterOpen) return;
    const priceNum = parseFloat(counterPrice);
    if (isNaN(priceNum) || priceNum <= 0) { setError('Enter a valid counter price.'); return; }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('product_offers')
      .update({ counter_price: priceNum, seller_message: counterMessage.trim() || null })
      .eq('id', counterOpen.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    setNotice(`Counter offer of ${formatCurrency(priceNum)} sent.`);
    setCounterOpen(null);
    load();
  };

  if (!user) return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  if (loading) return <div className="container-app py-12 animate-pulse"><div className="h-8 bg-cream-100 rounded w-1/3" /></div>;

  const pendingReceived = receivedOffers.filter((o) => o.status === 'pending').length;
  const pendingSent = sentOffers.filter((o) => o.status === 'pending').length;

  return (
    <div className="container-app max-w-4xl py-8 animate-fade-in">
      <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </button>
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 text-white">
          <Tag className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Offers & Negotiations</h1>
          <p className="text-sm text-brand-500">Manage your price offers and counteroffers</p>
        </div>
      </div>

      {notice && <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-800">{notice}</div>}
      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{error}</div>}

      {seller && (
        <div className="flex gap-1 mb-6 border-b border-brand-100">
          <button
            onClick={() => setTab('received')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === 'received' ? 'text-brand-700 border-brand-600' : 'text-brand-400 border-transparent hover:text-brand-600'}`}
          >
            Received ({pendingReceived > 0 ? `${pendingReceived} new` : receivedOffers.length})
          </button>
          <button
            onClick={() => setTab('sent')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === 'sent' ? 'text-brand-700 border-brand-600' : 'text-brand-400 border-transparent hover:text-brand-600'}`}
          >
            Sent ({pendingSent > 0 ? `${pendingSent} pending` : sentOffers.length})
          </button>
        </div>
      )}

      {tab === 'received' && !seller && (
        <EmptyState
          icon={<Tag className="h-8 w-8" />}
          title="No seller profile"
          description="You need a seller profile to receive offers on your products."
          action={<Button onClick={() => navigate('/seller/setup')}>Set Up Store</Button>}
        />
      )}

      {tab === 'received' && seller && (
        <div className="space-y-3">
          {receivedOffers.length > 0 ? (
            receivedOffers.map((offer) => {
              const buyer = buyers[offer.buyer_id];
              const primaryImage = offer.product?.product_images?.find((img) => img.is_primary) ?? offer.product?.product_images?.[0];
              const statusCfg = STATUS_CONFIG[offer.status] ?? STATUS_CONFIG.pending;
              const isPending = offer.status === 'pending';
              return (
                <div key={offer.id} className="bg-white rounded-xl border border-brand-100 p-4 flex flex-col sm:flex-row gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="h-14 w-14 rounded-lg bg-cream-100 overflow-hidden shrink-0">
                      {primaryImage ? (
                        <img src={primaryImage.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Tag className="h-6 w-6 text-brand-300" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <button onClick={() => navigate(`/product/${offer.product_id}`)} className="text-sm font-semibold text-brand-900 hover:text-brand-600 truncate block text-left">
                        {offer.product?.title ?? 'Product'}
                      </button>
                      <p className="text-xs text-brand-500 mt-0.5">From: {buyer?.display_name ?? 'Unknown buyer'}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                        <span className="text-sm font-bold text-brand-800">{formatCurrency(offer.proposed_price)}</span>
                        <span className="text-xs text-brand-400">for {offer.quantity} unit{offer.quantity !== 1 ? 's' : ''}</span>
                        {offer.counter_price && <span className="text-xs text-accent-600 font-medium">Counter: {formatCurrency(offer.counter_price)}</span>}
                      </div>
                      {offer.buyer_message && <p className="text-xs text-brand-500 mt-1.5 italic">"{offer.buyer_message}"</p>}
                      {offer.seller_message && offer.status !== 'pending' && <p className="text-xs text-brand-600 mt-1">Your response: {offer.seller_message}</p>}
                      <p className="text-xs text-brand-400 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {formatDate(offer.created_at)}
                        {offer.expires_at && offer.status === 'pending' && <span> · Expires {formatDate(offer.expires_at)}</span>}
                      </p>
                    </div>
                  </div>
                  {isPending && (
                    <div className="flex items-center gap-1 shrink-0 flex-wrap">
                      <Button size="sm" variant="primary" onClick={() => handleAccept(offer)} loading={busy}>
                        <Check className="h-4 w-4" /> Accept
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleReject(offer)} loading={busy}>
                        <X className="h-4 w-4" /> Reject
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openCounter(offer)}>
                        <TrendingDown className="h-4 w-4" /> Counter
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <EmptyState
              icon={<Tag className="h-8 w-8" />}
              title="No offers received"
              description="When buyers make offers on your products, they'll appear here for you to accept, reject, or counter."
            />
          )}
        </div>
      )}

      {tab === 'sent' && (
        <div className="space-y-3">
          {sentOffers.length > 0 ? (
            sentOffers.map((offer) => {
              const primaryImage = offer.product?.product_images?.find((img) => img.is_primary) ?? offer.product?.product_images?.[0];
              const statusCfg = STATUS_CONFIG[offer.status] ?? STATUS_CONFIG.pending;
              const isPending = offer.status === 'pending';
              const hasCounter = offer.counter_price !== null && offer.status === 'pending';
              return (
                <div key={offer.id} className="bg-white rounded-xl border border-brand-100 p-4 flex flex-col sm:flex-row gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="h-14 w-14 rounded-lg bg-cream-100 overflow-hidden shrink-0">
                      {primaryImage ? (
                        <img src={primaryImage.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Tag className="h-6 w-6 text-brand-300" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <button onClick={() => navigate(`/product/${offer.product_id}`)} className="text-sm font-semibold text-brand-900 hover:text-brand-600 truncate block text-left">
                        {offer.product?.title ?? 'Product'}
                      </button>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                        <span className="text-sm font-bold text-brand-800">{formatCurrency(offer.proposed_price)}</span>
                        <span className="text-xs text-brand-400">for {offer.quantity} unit{offer.quantity !== 1 ? 's' : ''}</span>
                      </div>
                      {hasCounter && (
                        <div className="mt-2 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2 text-sm">
                          <p className="font-medium text-accent-800">Seller countered: {formatCurrency(offer.counter_price!)}</p>
                          {offer.seller_message && <p className="text-xs text-accent-700 mt-0.5">{offer.seller_message}</p>}
                        </div>
                      )}
                      {offer.buyer_message && <p className="text-xs text-brand-500 mt-1.5 italic">"{offer.buyer_message}"</p>}
                      <p className="text-xs text-brand-400 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {formatDate(offer.created_at)}
                        {offer.expires_at && isPending && <span> · Expires {formatDate(offer.expires_at)}</span>}
                      </p>
                    </div>
                  </div>
                  {isPending && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => handleWithdraw(offer)} loading={busy}>
                        <X className="h-4 w-4" /> Withdraw
                      </Button>
                      {offer.conversation_id && (
                        <Button size="sm" variant="outline" onClick={() => navigate(`/messages?c=${offer.conversation_id}`)}>
                          <MessageCircle className="h-4 w-4" /> Message
                        </Button>
                      )}
                    </div>
                  )}
                  {offer.status === 'accepted' && offer.conversation_id && (
                    <Button size="sm" variant="outline" onClick={() => navigate(`/messages?c=${offer.conversation_id}`)}>
                      <MessageCircle className="h-4 w-4" /> Contact Seller
                    </Button>
                  )}
                </div>
              );
            })
          ) : (
            <EmptyState
              icon={<Send className="h-8 w-8" />}
              title="No offers sent"
              description="When you make offers on products, they'll appear here so you can track their status."
              action={<Button onClick={() => navigate('/browse')}>Browse Products</Button>}
            />
          )}
        </div>
      )}

      {/* Counter offer modal */}
      <Modal open={!!counterOpen} onClose={() => setCounterOpen(null)} title="Counter Offer" size="sm">
        <div className="space-y-4">
          <div className="bg-cream-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-brand-800">{counterOpen?.product?.title}</p>
            <p className="text-xs mt-0.5 text-brand-500">
              Buyer offered: {counterOpen && formatCurrency(counterOpen.proposed_price)} · Listed: {counterOpen?.product && formatCurrency(counterOpen.product.price)}
            </p>
          </div>
          <Input label="Your Counter Price (PHP)" type="number" step="0.01" value={counterPrice} onChange={(e) => setCounterPrice(e.target.value)} placeholder="0.00" required />
          <Textarea label="Message to buyer (optional)" value={counterMessage} onChange={(e) => setCounterMessage(e.target.value)} rows={2} placeholder="Explain your counter offer..." />
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>}
          <Button onClick={handleCounter} disabled={!counterPrice || busy} loading={busy} className="w-full">
            <Send className="h-4 w-4" /> Send Counter Offer
          </Button>
        </div>
      </Modal>
    </div>
  );
}
