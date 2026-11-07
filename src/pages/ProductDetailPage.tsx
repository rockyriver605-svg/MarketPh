import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, MapPin, MessageCircle, Heart, ShoppingCart, Store, Star, Flag,
  Package, Share2, Zap, Minus, Plus, Check, Truck, Store as StoreIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { navigate } from '@/lib/router';
import type { ProductWithRelations, ReviewWithRelations, ProductRatingSummary, ProductVariant, BulkPricingTier } from '@/types';
import { formatCurrency, getConditionLabel, formatDate, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Textarea, Select, Input } from '@/components/ui/Input';
import { ProductCard } from '@/components/ProductCard';
import { ReviewSection } from '@/components/reviews/ReviewSection';
import { fetchProductReviews, fetchProductRatingSummary } from '@/lib/reviews';
import { Tag, Clock } from 'lucide-react';

interface ProductDetailPageProps {
  productId: string;
}

export function ProductDetailPage({ productId }: ProductDetailPageProps) {
  const { user } = useAuth();
  const wishlist = useWishlist();
  const [product, setProduct] = useState<ProductWithRelations | null>(null);
  const [reviews, setReviews] = useState<ReviewWithRelations[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ProductRatingSummary | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [relatedProducts, setRelatedProducts] = useState<ProductWithRelations[]>([]);
  const [sellerProducts, setSellerProducts] = useState<ProductWithRelations[]>([]);
  const [subCategory, setSubCategory] = useState<{ name: string; slug: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartAdded, setCartAdded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkTiers, setBulkTiers] = useState<BulkPricingTier[]>([]);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerPrice, setOfferPrice] = useState('');
  const [offerQty, setOfferQty] = useState('1');
  const [offerMessage, setOfferMessage] = useState('');
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerSuccess, setOfferSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchErr } = await supabase
      .from('products')
      .select(`
        *,
        seller:seller_profiles(*),
        category:categories(*),
        municipality:municipalities(*),
        barangay:barangays(*),
        product_images(*),
        product_variants(*)
      `)
      .eq('id', productId)
      .maybeSingle();

    if (fetchErr) { setError('Could not load product.'); setLoading(false); return; }
    if (!data) { setLoading(false); return; }

    const prod = data as ProductWithRelations;

    if (prod.status !== 'published') {
      const { data: sellerCheck } = await supabase
        .from('seller_profiles').select('user_id').eq('id', prod.seller_id).maybeSingle();
      if (sellerCheck?.user_id !== user?.id) {
        setLoading(false);
        return;
      }
    }

    setProduct(prod);

    const { data: tierData } = await supabase
      .from('bulk_pricing_tiers')
      .select('*')
      .eq('product_id', productId)
      .order('min_quantity', { ascending: true });
    setBulkTiers(tierData as BulkPricingTier[] ?? []);

    if (prod.category?.parent_id) {
      const { data: parent } = await supabase.from('categories').select('name, slug').eq('id', prod.category.parent_id).maybeSingle();
      setSubCategory(parent as { name: string; slug: string } | null);
    }

    fetchProductReviews(productId).then(setReviews).catch(() => setReviews([]));
    fetchProductRatingSummary(productId).then(setReviewSummary).catch(() => setReviewSummary(null));
    setReviewsLoading(false);

    if (prod.category_id) {
      const { data: related } = await supabase
        .from('products')
        .select(`
          *,
          seller:seller_profiles(*),
          category:categories(*),
          municipality:municipalities(*),
          barangay:barangays(*),
          product_images(*),
          product_variants(*)
        `)
        .eq('status', 'published')
        .eq('category_id', prod.category_id)
        .neq('id', productId)
        .order('created_at', { ascending: false })
        .limit(4);
      setRelatedProducts(related as ProductWithRelations[] ?? []);
    }

    const { data: sellerProds } = await supabase
      .from('products')
      .select(`
        *,
        seller:seller_profiles(*),
        category:categories(*),
        municipality:municipalities(*),
        barangay:barangays(*),
        product_images(*),
        product_variants(*)
      `)
      .eq('status', 'published')
      .eq('seller_id', prod.seller_id)
      .neq('id', productId)
      .order('created_at', { ascending: false })
      .limit(4);
    setSellerProducts(sellerProds as ProductWithRelations[] ?? []);

    setLoading(false);
  }, [productId, user]);

  useEffect(() => { load(); }, [load]);

  const availableStock = useMemo(() => {
    if (selectedVariant) return selectedVariant.stock;
    return product?.stock ?? 0;
  }, [selectedVariant, product]);

  const effectivePrice = useMemo(() => {
    if (selectedVariant?.price_override) return selectedVariant.price_override;
    return product?.sale_price ?? product?.price ?? 0;
  }, [selectedVariant, product]);

  const hasDiscount = useMemo(() => {
    if (selectedVariant?.price_override) return false;
    return product?.sale_price !== null && product!.sale_price! < product!.price;
  }, [selectedVariant, product]);

  const discountPercentage = useMemo(() => {
    if (!hasDiscount || !product?.sale_price) return 0;
    return Math.round((1 - product.sale_price / product.price) * 100);
  }, [hasDiscount, product]);

  const isOwnProduct = product?.seller?.user_id === user?.id;

  const canNegotiate = useMemo(() => {
    if (!product || isOwnProduct) return false;
    return product.negotiation_enabled || product.seller?.negotiation_enabled === true;
  }, [product, isOwnProduct]);

  const activeBulkTier = useMemo(() => {
    if (bulkTiers.length === 0) return null;
    return bulkTiers.find((t) => quantity >= t.min_quantity && (!t.max_quantity || quantity <= t.max_quantity)) ?? null;
  }, [bulkTiers, quantity]);

  const bulkAdjustedPrice = useMemo(() => {
    if (!activeBulkTier) return effectivePrice;
    return effectivePrice * (1 - activeBulkTier.discount_percentage / 100);
  }, [activeBulkTier, effectivePrice]);

  const handleAddToCart = async () => {
    if (!user || !product) return;
    if (availableStock === 0) return;
    setAddingToCart(true);
    const { data: cart } = await supabase.from('carts').select('id').eq('user_id', user.id).maybeSingle();
    let cartId = cart?.id;
    if (!cartId) {
      const { data: newCart } = await supabase.from('carts').insert({ user_id: user.id }).select('id').single();
      cartId = newCart?.id;
    }
    if (cartId) {
      const { error: itemErr } = await supabase.from('cart_items').upsert(
        { cart_id: cartId, product_id: product.id, variant_id: selectedVariant?.id ?? null, quantity },
        { onConflict: 'cart_id,product_id,variant_id' },
      );
      if (itemErr) {
        const { error: insertErr } = await supabase.from('cart_items').insert({
          cart_id: cartId, product_id: product.id, variant_id: selectedVariant?.id ?? null, quantity,
        });
        if (insertErr) { setNotice('Could not add to cart.'); setAddingToCart(false); return; }
      }
      setCartAdded(true);
      setTimeout(() => setCartAdded(false), 2000);
    }
    setAddingToCart(false);
  };

  const handleBuyNow = async () => {
    if (!user || !product) return;
    if (availableStock === 0) return;
    setAddingToCart(true);
    const { data: cart } = await supabase.from('carts').select('id').eq('user_id', user.id).maybeSingle();
    let cartId = cart?.id;
    if (!cartId) {
      const { data: newCart } = await supabase.from('carts').insert({ user_id: user.id }).select('id').single();
      cartId = newCart?.id;
    }
    if (cartId) {
      await supabase.from('cart_items').upsert(
        { cart_id: cartId, product_id: product.id, variant_id: selectedVariant?.id ?? null, quantity },
        { onConflict: 'cart_id,product_id,variant_id' },
      );
      setAddingToCart(false);
      navigate('/cart');
      return;
    }
    setAddingToCart(false);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/#/product/${productId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: product?.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice('Link copied to clipboard.');
        setTimeout(() => setNotice(null), 2000);
      }
    } catch { /* user cancelled */ }
  };

  const handleMakeOffer = async () => {
    if (!user || !product) return;
    setOfferError(null);
    const priceNum = parseFloat(offerPrice);
    if (isNaN(priceNum) || priceNum <= 0) { setOfferError('Enter a valid offer amount.'); return; }
    const qtyNum = parseInt(offerQty) || 1;
    if (qtyNum < 1) { setOfferError('Quantity must be at least 1.'); return; }
    setOfferBusy(true);

    let conversationId: string | null = null;
    if (product.seller) {
      const sellerUserId = product.seller.user_id;
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1.eq.${user.id},participant_2.eq.${sellerUserId}),and(participant_1.eq.${sellerUserId},participant_2.eq.${user.id})`)
        .maybeSingle();
      if (existing) {
        conversationId = existing.id;
      } else {
        const { data: conv } = await supabase
          .from('conversations')
          .insert({ participant_1: user.id, participant_2: sellerUserId, product_id: product.id })
          .select('id')
          .single();
        conversationId = conv?.id ?? null;
      }
    }

    const expiryHours = product.seller?.default_offer_expiry_hours ?? 48;
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

    const { error: offerErr } = await supabase.from('product_offers').insert({
      product_id: product.id,
      buyer_id: user.id,
      seller_id: product.seller_id,
      conversation_id: conversationId,
      proposed_price: priceNum,
      quantity: qtyNum,
      buyer_message: offerMessage.trim() || null,
      expires_at: expiresAt,
    });

    setOfferBusy(false);
    if (offerErr) {
      setOfferError(offerErr.message);
      return;
    }
    setOfferSuccess('Your offer has been sent! The seller will be notified.');
    setOfferOpen(false);
    setOfferPrice('');
    setOfferMessage('');
    setTimeout(() => setOfferSuccess(null), 4000);
  };

  const handleStartConversation = async () => {
    if (!user || !product?.seller) return;
    const sellerUserId = product.seller.user_id;
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1.eq.${user.id},participant_2.eq.${sellerUserId}),and(participant_1.eq.${sellerUserId},participant_2.eq.${user.id})`)
      .maybeSingle();
    if (existing) {
      navigate(`/messages?c=${existing.id}`);
    } else {
      const { data: conv } = await supabase
        .from('conversations')
        .insert({ participant_1: user.id, participant_2: sellerUserId, product_id: product.id })
        .select('id')
        .single();
      if (conv) navigate(`/messages?c=${conv.id}`);
    }
  };

  const handleSubmitReport = async () => {
    if (!user || !product || !reportReason) return;
    await supabase.from('reports').insert({
      reporter_id: user.id,
      target_type: 'product',
      target_id: product.id,
      reason: reportReason,
      description: reportDesc || null,
    });
    setReportOpen(false);
    setReportReason('');
    setReportDesc('');
    setNotice('Report submitted. Thank you.');
    setTimeout(() => setNotice(null), 3000);
  };

  const adjustQuantity = (delta: number) => {
    setQuantity((prev) => Math.max(1, Math.min(availableStock, prev + delta)));
  };

  if (loading) {
    return (
      <div className="container-app py-12">
        <div className="animate-pulse">
          <div className="h-6 bg-cream-100 rounded w-32 mb-6" />
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="aspect-square bg-cream-100 rounded-xl" />
            <div className="space-y-4">
              <div className="h-8 bg-cream-100 rounded w-3/4" />
              <div className="h-6 bg-cream-100 rounded w-1/3" />
              <div className="h-24 bg-cream-100 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container-app py-12">
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="Product not found"
          description="This product may have been removed, is no longer available, or has not been published."
          action={<Button onClick={() => navigate('/browse')}>Browse Marketplace</Button>}
        />
      </div>
    );
  }

  const images = product.product_images ?? [];
  const primaryImage = images[selectedImage];
  const variants = product.product_variants ?? [];
  const deliveryOpts = product.delivery_options ?? [];
  const publishedDate = product.status === 'published' ? product.updated_at : product.created_at;

  return (
    <div className="container-app py-6 animate-fade-in">
      <button onClick={() => navigate('/browse')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to browse
      </button>

      {notice && <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-800">{notice}</div>}
      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{error}</div>}

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Images */}
        <div>
          <button
            onClick={() => images.length > 0 && setZoomOpen(true)}
            className="block w-full aspect-square bg-cream-100 rounded-xl overflow-hidden mb-3 relative group"
          >
            {primaryImage ? (
              <img src={primaryImage.image_url} alt={primaryImage.alt_text ?? product.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-brand-300">
                <Package className="h-16 w-16" />
              </div>
            )}
            {images.length > 1 && (
              <div className="absolute bottom-3 right-3 bg-brand-950/60 text-white text-xs px-2 py-1 rounded-lg">{selectedImage + 1} / {images.length}</div>
            )}
          </button>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedImage(i)}
                  className={`h-20 w-20 rounded-lg overflow-hidden shrink-0 border-2 transition-colors ${selectedImage === i ? 'border-brand-500' : 'border-brand-100 hover:border-brand-300'}`}
                >
                  <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-5">
          <div>
            <div className="flex items-start justify-between gap-3 mb-2">
              <h1 className="text-2xl font-bold text-brand-900">{product.title}</h1>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={handleShare} aria-label="Share" className="p-2 rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors">
                  <Share2 className="h-5 w-5" />
                </button>
                {user && !isOwnProduct && (
                  <button onClick={() => setReportOpen(true)} aria-label="Report" className="p-2 rounded-lg text-brand-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Flag className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge variant="default">{getConditionLabel(product.condition)}</Badge>
              {product.category && (
                <button onClick={() => navigate(`/browse?category=${product.category!.slug}`)}>
                  <Badge variant="info">{product.category.name}</Badge>
                </button>
              )}
              {hasDiscount && <Badge variant="accent">On Sale</Badge>}
              {canNegotiate && <Badge variant="info"><Tag className="h-3 w-3" /> Negotiable</Badge>}
              {bulkTiers.length > 0 && <Badge variant="brand">Bulk Pricing</Badge>}
              {product.stock === 0 && <Badge variant="error">Out of Stock</Badge>}
              {product.stock > 0 && product.stock <= 3 && <Badge variant="warning">Only {product.stock} left</Badge>}
            </div>
            {reviewSummary && reviewSummary.total_reviews > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <span className="text-amber-500">{'\u2605'.repeat(Math.round(reviewSummary.avg_rating))}</span>
                <span className="text-brand-600 font-medium">{reviewSummary.avg_rating.toFixed(1)}</span>
                <span className="text-brand-400">({reviewSummary.total_reviews} review{reviewSummary.total_reviews !== 1 ? 's' : ''})</span>
              </div>
            )}
          </div>

          {/* Price */}
          <div className="space-y-1">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-brand-800">{formatCurrency(bulkAdjustedPrice)}</span>
              {hasDiscount && <span className="text-lg text-brand-400 line-through">{formatCurrency(product.price)}</span>}
            </div>
            {hasDiscount && discountPercentage > 0 && (
              <p className="text-sm font-medium text-accent-600">{discountPercentage}% off regular price</p>
            )}
            {activeBulkTier && (
              <p className="text-sm font-medium text-brand-600 bg-brand-50 rounded-lg px-3 py-1.5">
                {activeBulkTier.label ?? 'Bulk discount'}: {activeBulkTier.discount_percentage}% off for {activeBulkTier.min_quantity}+ units
              </p>
            )}
            {bulkTiers.length > 0 && !activeBulkTier && (
              <p className="text-xs text-brand-500">
                Bulk discounts available: {bulkTiers.map((t) => `${t.min_quantity}+ (${t.discount_percentage}% off)`).join(', ')}
              </p>
            )}
          </div>

          {offerSuccess && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-800">{offerSuccess}</div>}

          {/* Variants */}
          {variants.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-brand-900 mb-2">Options</h3>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => {
                  const isSelected = selectedVariant?.id === v.id;
                  const outOfStock = v.stock === 0;
                  return (
                    <button
                      key={v.id}
                      onClick={() => { setSelectedVariant(v); setQuantity(1); }}
                      disabled={outOfStock}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        isSelected ? 'bg-brand-600 text-white border-brand-600'
                        : outOfStock ? 'bg-cream-50 text-brand-300 border-brand-100 cursor-not-allowed'
                        : 'bg-white text-brand-700 border-brand-200 hover:border-brand-400'
                      }`}
                    >
                      {v.name}: {v.value}
                      {v.price_override && <span className="block text-xs opacity-80">{formatCurrency(v.price_override)}</span>}
                      {outOfStock && <span className="block text-xs">Out of stock</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity */}
          {availableStock > 0 && !isOwnProduct && (
            <div>
              <h3 className="text-sm font-semibold text-brand-900 mb-2">Quantity</h3>
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-brand-200 rounded-lg">
                  <button onClick={() => adjustQuantity(-1)} disabled={quantity <= 1} className="p-2 text-brand-600 hover:bg-brand-50 disabled:text-brand-300 rounded-l-lg transition-colors">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-12 text-center text-sm font-semibold text-brand-900">{quantity}</span>
                  <button onClick={() => adjustQuantity(1)} disabled={quantity >= availableStock} className="p-2 text-brand-600 hover:bg-brand-50 disabled:text-brand-300 rounded-r-lg transition-colors">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-xs text-brand-400">{availableStock} available</span>
              </div>
            </div>
          )}

          {/* Description */}
          {product.description && (
            <div>
              <h3 className="text-sm font-semibold text-brand-900 mb-2">Description</h3>
              <p className="text-sm text-brand-600 leading-relaxed whitespace-pre-wrap">{product.description}</p>
            </div>
          )}

          {/* Specifications */}
          <div className="bg-cream-50 rounded-xl border border-brand-100 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-brand-900 mb-1">Product Details</h3>
            <SpecRow label="Condition" value={getConditionLabel(product.condition)} />
            {product.condition_description && <SpecRow label="Condition Details" value={product.condition_description} />}
            {product.product_age && <SpecRow label="Product Age" value={product.product_age} />}
            {product.warranty_info && <SpecRow label="Warranty" value={product.warranty_info} />}
            {product.condition_notes && <SpecRow label="Condition Notes" value={product.condition_notes} />}
            {product.category && <SpecRow label="Category" value={subCategory ? `${subCategory.name} / ${product.category.name}` : product.category.name} />}
            {product.sku && <SpecRow label="SKU" value={product.sku} />}
            <SpecRow label="Stock" value={availableStock > 0 ? `${availableStock} available` : 'Out of stock'} />
            {product.municipality && (
              <SpecRow label="Location" value={`${product.municipality.name}${product.barangay ? `, ${product.barangay.name}` : ''}`} />
            )}
            <SpecRow label="Date Listed" value={formatDate(product.created_at)} />
            {product.status === 'published' && <SpecRow label="Published" value={formatDate(publishedDate)} />}
          </div>

          {/* Defects & repair disclosure for secondhand items */}
          {(product.defects || product.repair_history) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-amber-900">Item Disclosure</h3>
              {product.defects && <p className="text-sm text-amber-800"><span className="font-medium">Defects/Damage:</span> {product.defects}</p>}
              {product.repair_history && <p className="text-sm text-amber-800"><span className="font-medium">Repair History:</span> {product.repair_history}</p>}
            </div>
          )}

          {/* Delivery & pickup */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-brand-900">Delivery & Pickup</h3>
            <div className="flex flex-wrap gap-2">
              {deliveryOpts.length > 0 ? deliveryOpts.map((opt) => (
                <span key={opt} className="flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-50 px-2.5 py-1.5 rounded-lg">
                  <Truck className="h-3.5 w-3.5" />
                  {opt === 'cod' ? 'Cash on Delivery' : opt === 'gcash' ? 'GCash' : opt === 'bank_transfer' ? 'Bank Transfer' : opt === 'maya' ? 'Maya' : opt}
                </span>
              )) : <span className="text-xs text-brand-400">No delivery options specified</span>}
              {product.pickup_enabled && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-50 px-2.5 py-1.5 rounded-lg">
                  <StoreIcon className="h-3.5 w-3.5" /> Pickup available
                </span>
              )}
            </div>
          </div>

          {/* Location */}
          {product.municipality && (
            <div className="flex items-center gap-2 text-sm text-brand-600">
              <MapPin className="h-4 w-4 text-brand-400" />
              <span>{product.municipality.name}{product.barangay ? `, ${product.barangay.name}` : ''}</span>
            </div>
          )}

          {/* Seller card */}
          {product.seller && (
            <button
              onClick={() => navigate(`/seller/${product.seller!.slug}`)}
              className="w-full flex items-center gap-3 p-4 bg-cream-50 rounded-xl border border-brand-100 hover:border-brand-200 transition-colors text-left"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-100 text-brand-600 shrink-0 overflow-hidden">
                {product.seller.logo_url ? (
                  <img src={product.seller.logo_url} alt="" className="h-full w-full rounded-lg object-cover" />
                ) : (
                  <Store className="h-6 w-6" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-900 truncate">{product.seller.shop_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {product.seller.is_verified && (
                    <Badge variant="success"><Star className="h-3 w-3" /> Verified</Badge>
                  )}
                  <span className="text-xs text-brand-400">View store</span>
                </div>
              </div>
            </button>
          )}

          {/* Actions */}
          {!isOwnProduct && user && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  onClick={handleAddToCart}
                  size="lg"
                  variant="outline"
                  className="flex-1"
                  loading={addingToCart}
                  disabled={availableStock === 0}
                >
                  {cartAdded ? <><Check className="h-4 w-4" /> Added!</> : <><ShoppingCart className="h-4 w-4" /> Add to Cart</>}
                </Button>
                <Button
                  onClick={handleBuyNow}
                  size="lg"
                  className="flex-1"
                  loading={addingToCart}
                  disabled={availableStock === 0}
                >
                  <Zap className="h-4 w-4" /> Buy Now
                </Button>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => wishlist.toggleSave(productId)} disabled={wishlist.isPending(productId)} variant="outline" className="flex-1">
                  <Heart className={`h-5 w-5 ${wishlist.isSaved(productId) ? 'fill-red-500 text-red-500' : ''}`} />
                  {wishlist.isSaved(productId) ? 'Saved' : 'Add to Wishlist'}
                </Button>
                <Button onClick={handleStartConversation} variant="outline" className="flex-1">
                  <MessageCircle className="h-5 w-5" /> Contact Seller
                </Button>
              </div>
              {canNegotiate && availableStock > 0 && (
                <Button onClick={() => { setOfferPrice(String(Math.round(effectivePrice * 0.9))); setOfferQty(String(quantity)); setOfferError(null); setOfferOpen(true); }} variant="ghost" className="w-full">
                  <Tag className="h-4 w-4" /> Make an Offer
                </Button>
              )}
            </div>
          )}
          {!user && (
            <div className="flex gap-2">
              <Button onClick={() => navigate('/signin')} size="lg" className="flex-1">Sign in to buy</Button>
              <Button onClick={() => navigate('/signup')} size="lg" variant="outline">Sign up</Button>
            </div>
          )}
          {isOwnProduct && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <Store className="h-4 w-4" /> This is your own listing.
              <button onClick={() => navigate(`/seller/products/${product.id}/edit`)} className="font-semibold underline ml-auto">Edit listing</button>
            </div>
          )}

          <p className="text-xs text-brand-400">Listed {timeAgo(product.created_at)}</p>
        </div>
      </div>

      {/* Reviews section */}
      <div className="mt-12">
        <h2 className="text-xl font-bold text-brand-900 mb-4">Customer Reviews</h2>
        <ReviewSection
          summary={reviewSummary}
          reviews={reviews}
          loading={reviewsLoading}
          sellerShopName={product.seller?.shop_name}
        />
      </div>

      {/* Seller's other products */}
      {sellerProducts.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-brand-900">More from {product.seller?.shop_name}</h2>
            {product.seller && (
              <button onClick={() => navigate(`/seller/${product.seller!.slug}`)} className="text-sm font-medium text-brand-600 hover:text-brand-800 flex items-center gap-1 transition-colors">
                View store <ArrowLeft className="h-4 w-4 rotate-180" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {sellerProducts.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      )}

      {/* Related products */}
      {relatedProducts.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-bold text-brand-900 mb-4">Related Products</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {relatedProducts.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      )}

      {/* Image zoom modal */}
      <Modal open={zoomOpen} onClose={() => setZoomOpen(false)} size="lg">
        <div className="space-y-3">
          <div className="aspect-square bg-cream-100 rounded-xl overflow-hidden">
            {primaryImage && <img src={primaryImage.image_url} alt={primaryImage.alt_text ?? product.title} className="w-full h-full object-contain" />}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedImage(i)}
                  className={`h-16 w-16 rounded-lg overflow-hidden shrink-0 border-2 transition-colors ${selectedImage === i ? 'border-brand-500' : 'border-brand-100'}`}
                >
                  <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Make offer modal */}
      <Modal open={offerOpen} onClose={() => setOfferOpen(false)} title="Make an Offer" size="sm">
        <div className="space-y-4">
          <div className="bg-cream-50 rounded-lg p-3 text-sm text-brand-600">
            <p className="font-medium text-brand-800">{product.title}</p>
            <p className="text-xs mt-0.5">Listed price: {formatCurrency(effectivePrice)} · You can suggest a different price.</p>
            {product.min_offer_price && <p className="text-xs mt-0.5 text-brand-500">Minimum accepted offer: {formatCurrency(product.min_offer_price)}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Your Offer (PHP)" type="number" step="0.01" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} placeholder="0.00" required />
            <Input label="Quantity" type="number" value={offerQty} onChange={(e) => setOfferQty(e.target.value)} min="1" required />
          </div>
          <Textarea label="Message to seller (optional)" value={offerMessage} onChange={(e) => setOfferMessage(e.target.value)} rows={2} placeholder="Explain your offer..." />
          {offerError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{offerError}</div>}
          <p className="text-xs text-brand-400 flex items-center gap-1"><Clock className="h-3 w-3" /> Offers expire after {product.seller?.default_offer_expiry_hours ?? 48} hours if not responded to.</p>
          <Button onClick={handleMakeOffer} disabled={!offerPrice || offerBusy} loading={offerBusy} className="w-full">Send Offer</Button>
        </div>
      </Modal>

      {/* Report modal */}
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report this product" size="sm">
        <div className="space-y-4">
          <Select label="Reason" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
            <option value="">Select a reason...</option>
            <option value="spam">Spam</option>
            <option value="scam">Scam / Fraud</option>
            <option value="inappropriate">Inappropriate content</option>
            <option value="counterfeit">Counterfeit item</option>
            <option value="other">Other</option>
          </Select>
          <Textarea
            label="Details (optional)"
            value={reportDesc}
            onChange={(e) => setReportDesc(e.target.value)}
            rows={3}
            placeholder="Provide additional context..."
          />
          <Button onClick={handleSubmitReport} disabled={!reportReason} className="w-full">Submit Report</Button>
        </div>
      </Modal>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-brand-400">{label}</span>
      <span className="text-brand-700 font-medium text-right">{value}</span>
    </div>
  );
}
