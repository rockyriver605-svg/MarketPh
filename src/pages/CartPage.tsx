import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShoppingCart, Trash2, ArrowLeft, Package, Store, Minus, Plus,
  Bookmark, AlertCircle, X, Check, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { BulkPricingTier, CartItemWithRelations, ProductWithRelations } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, getConditionLabel } from '@/lib/utils';

interface SellerGroup {
  sellerId: string;
  shopName: string;
  shopSlug: string | null;
  items: CartItemWithRelations[];
}

function getEffectivePrice(product: ProductWithRelations | undefined): number {
  if (!product) return 0;
  const now = new Date();
  const promoActive =
    product.promotion_start_at && product.promotion_end_at &&
    new Date(product.promotion_start_at) <= now && new Date(product.promotion_end_at) >= now;
  if (promoActive && product.sale_price != null) return product.sale_price;
  return product.sale_price ?? product.price;
}

function getBulkAdjustedPrice(product: ProductWithRelations | undefined, quantity: number, tiers: BulkPricingTier[]): number {
  const base = getEffectivePrice(product);
  if (!product || tiers.length === 0) return base;
  const productTiers = tiers
    .filter((t) => t.product_id === product.id)
    .sort((a, b) => b.min_quantity - a.min_quantity);
  const applicable = productTiers.find((t) => quantity >= t.min_quantity && (t.max_quantity == null || quantity <= t.max_quantity));
  if (applicable) return base * (1 - applicable.discount_percentage / 100);
  return base;
}

function isItemAvailable(item: CartItemWithRelations): { available: boolean; reason?: string } {
  const product = item.product;
  if (!product) return { available: false, reason: 'Product no longer available' };
  if (product.status === 'sold_out' || product.status === 'archived') return { available: false, reason: 'No longer available' };
  if (product.status !== 'published') return { available: false, reason: 'Currently unavailable' };
  if (product.stock === 0) return { available: false, reason: 'Out of stock' };
  return { available: true };
}

export function CartPage() {
  const { user } = useAuth();
  const [allItems, setAllItems] = useState<CartItemWithRelations[]>([]);
  const [bulkTiers, setBulkTiers] = useState<BulkPricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const fetchCart = useCallback(async () => {
    if (!user) return;
    const { data: cart } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!cart) {
      setAllItems([]);
      setLoading(false);
      return;
    }
    const { data: itemData } = await supabase
      .from('cart_items')
      .select(`
        *,
        product:products(
          *,
          seller:seller_profiles(*),
          category:categories(*),
          municipality:municipalities(*),
          product_images(*)
        )
      `)
      .eq('cart_id', cart.id)
      .order('created_at', { ascending: false });
    const items = (itemData as CartItemWithRelations[]) ?? [];
    setAllItems(items);

    const productIds = items
      .map((i) => i.product?.id)
      .filter((id): id is string => !!id);
    if (productIds.length > 0) {
      const { data: tiers } = await supabase
        .from('bulk_pricing_tiers')
        .select('*')
        .in('product_id', productIds)
        .order('min_quantity', { ascending: true });
      setBulkTiers((tiers as BulkPricingTier[]) ?? []);
    } else {
      setBulkTiers([]);
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      items.forEach((item) => {
        const { available } = isItemAvailable(item);
        if (available && item.selected_for_checkout && !item.saved_for_later) {
          next.add(item.id);
        }
      });
      items.forEach((item) => {
        const { available } = isItemAvailable(item);
        if (!available || item.saved_for_later) next.delete(item.id);
      });
      return next;
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const activeItems = useMemo(() => allItems.filter((i) => !i.saved_for_later), [allItems]);
  const savedItems = useMemo(() => allItems.filter((i) => i.saved_for_later), [allItems]);

  const sellerGroups = useMemo<SellerGroup[]>(() => {
    const map = new Map<string, SellerGroup>();
    activeItems.forEach((item) => {
      const sellerId = item.product?.seller_id ?? 'unknown';
      const existing = map.get(sellerId);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(sellerId, {
          sellerId,
          shopName: item.product?.seller?.shop_name ?? 'Unknown Store',
          shopSlug: item.product?.seller?.slug ?? null,
          items: [item],
        });
      }
    });
    return Array.from(map.values());
  }, [activeItems]);

  const handleUpdateQty = async (itemId: string, qty: number, maxStock: number) => {
    const clamped = Math.max(1, Math.min(maxStock, qty));
    if (clamped < 1) return;
    setUpdatingId(itemId);
    setAllItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantity: clamped } : i)));
    await supabase.from('cart_items').update({ quantity: clamped }).eq('id', itemId);
    setUpdatingId(null);
  };

  const handleRemove = async (itemId: string) => {
    setAllItems((prev) => prev.filter((i) => i.id !== itemId));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(itemId); return n; });
    await supabase.from('cart_items').delete().eq('id', itemId);
  };

  const handleToggleSave = async (itemId: string, save: boolean) => {
    setUpdatingId(itemId);
    setAllItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, saved_for_later: save } : i)));
    if (save) {
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(itemId); return n; });
    }
    await supabase.from('cart_items').update({ saved_for_later: save }).eq('id', itemId);
    setUpdatingId(null);
  };

  const handleToggleSelect = async (itemId: string, select: boolean) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (select) n.add(itemId); else n.delete(itemId);
      return n;
    });
    supabase.from('cart_items').update({ selected_for_checkout: select }).eq('id', itemId).then();
  };

  const handleToggleSellerGroup = (group: SellerGroup, select: boolean) => {
    const availableIds = group.items.filter((i) => isItemAvailable(i).available).map((i) => i.id);
    setSelectedIds((prev) => {
      const n = new Set(prev);
      availableIds.forEach((id) => { if (select) n.add(id); else n.delete(id); });
      return n;
    });
    supabase.from('cart_items')
      .update({ selected_for_checkout: select })
      .in('id', availableIds)
      .then();
  };

  const handleSelectAll = (select: boolean) => {
    const availableIds = activeItems.filter((i) => isItemAvailable(i).available).map((i) => i.id);
    setSelectedIds((prev) => {
      const n = new Set(prev);
      availableIds.forEach((id) => { if (select) n.add(id); else n.delete(id); });
      return n;
    });
    if (availableIds.length > 0) {
      supabase.from('cart_items')
        .update({ selected_for_checkout: select })
        .in('id', availableIds)
        .then();
    }
  };

  const handleClearCart = async () => {
    const activeIds = activeItems.map((i) => i.id);
    if (activeIds.length === 0) return;
    setAllItems((prev) => prev.filter((i) => i.saved_for_later));
    setSelectedIds(new Set());
    setShowClearConfirm(false);
    await supabase.from('cart_items').delete().in('id', activeIds);
  };

  const selectedItems = activeItems.filter((i) => selectedIds.has(i.id));
  const subtotal = selectedItems.reduce((sum, item) => {
    const price = getBulkAdjustedPrice(item.product, item.quantity, bulkTiers);
    return sum + price * item.quantity;
  }, 0);

  const totalSavings = selectedItems.reduce((sum, item) => {
    const product = item.product;
    if (!product) return sum;
    const basePrice = product.price;
    const effectivePrice = getBulkAdjustedPrice(item.product, item.quantity, bulkTiers);
    if (effectivePrice < basePrice) {
      return sum + (basePrice - effectivePrice) * item.quantity;
    }
    return sum;
  }, 0);

  const allAvailableSelected = activeItems.filter((i) => isItemAvailable(i).available).every((i) => selectedIds.has(i.id));
  const hasAvailableItems = activeItems.some((i) => isItemAvailable(i).available);

  if (!user) {
    return (
      <div className="container-app py-16 text-center">
        <Button onClick={() => navigate('/signin')}>Sign In</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container-app py-12 animate-pulse space-y-4">
        <div className="h-8 bg-cream-100 rounded w-1/4" />
        <div className="h-32 bg-cream-100 rounded-xl" />
        <div className="h-32 bg-cream-100 rounded-xl" />
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="container-app py-8 animate-fade-in">
        <button onClick={() => navigate('/browse')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Continue shopping
        </button>
        <h1 className="text-2xl font-bold text-brand-900 mb-6">Shopping Cart</h1>
        <EmptyState
          icon={<ShoppingCart className="h-8 w-8" />}
          title="Your cart is empty"
          description="Browse the marketplace and add products from Marinduque stores to your cart."
          action={<Button onClick={() => navigate('/browse')}>Browse Products</Button>}
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/browse')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Continue shopping
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-brand-900">Shopping Cart</h1>
        {activeItems.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="text-sm text-brand-500 hover:text-red-600 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="h-4 w-4" /> Clear cart
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Cart items grouped by seller */}
        <div className="lg:col-span-2 space-y-5">
          {hasAvailableItems && (
            <label className="flex items-center gap-2 text-sm text-brand-700 cursor-pointer select-none bg-white rounded-lg border border-brand-100 px-4 py-2.5">
              <input
                type="checkbox"
                checked={allAvailableSelected}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="font-medium">Select all available items</span>
            </label>
          )}

          {sellerGroups.map((group) => {
            const groupAvailableItems = group.items.filter((i) => isItemAvailable(i).available);
            const allGroupSelected = groupAvailableItems.length > 0 && groupAvailableItems.every((i) => selectedIds.has(i.id));
            const groupSubtotal = groupAvailableItems
              .filter((i) => selectedIds.has(i.id))
              .reduce((sum, item) => {
                const price = getBulkAdjustedPrice(item.product, item.quantity, bulkTiers);
                return sum + price * item.quantity;
              }, 0);

            return (
              <div key={group.sellerId} className="bg-white rounded-xl border border-brand-100 overflow-hidden">
                {/* Seller header */}
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-brand-50/60 border-b border-brand-100">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {groupAvailableItems.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allGroupSelected}
                        onChange={(e) => handleToggleSellerGroup(group, e.target.checked)}
                        className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-500 shrink-0"
                      />
                    )}
                    <Store className="h-4 w-4 text-brand-600 shrink-0" />
                    <button
                      onClick={() => group.shopSlug && navigate(`/seller/${group.shopSlug}`)}
                      className="text-sm font-semibold text-brand-800 hover:text-brand-600 transition-colors truncate"
                    >
                      {group.shopName}
                    </button>
                  </div>
                  {groupSubtotal > 0 && (
                    <span className="text-sm font-medium text-brand-600 shrink-0">
                      {formatCurrency(groupSubtotal)}
                    </span>
                  )}
                </div>

                {/* Items */}
                <div className="divide-y divide-brand-50">
                  {group.items.map((item) => {
                    const product = item.product;
                    const primaryImg = product?.product_images?.find((img) => img.is_primary) ?? product?.product_images?.[0];
                    const { available, reason } = isItemAvailable(item);
                    const effectivePrice = getEffectivePrice(product);
                    const bulkPrice = getBulkAdjustedPrice(product, item.quantity, bulkTiers);
                    const hasBulkDiscount = bulkPrice < effectivePrice;
                    const hasSaleDiscount = product && product.sale_price != null && product.sale_price < product.price;
                    const maxQty = product?.stock ?? 1;
                    const stockLow = product && product.stock > 0 && product.stock <= 3;
                    const overStock = available && item.quantity > maxQty;
                    const isSelected = selectedIds.has(item.id);

                    return (
                      <div key={item.id} className={`flex gap-3 sm:gap-4 p-4 ${!available ? 'opacity-60' : ''}`}>
                        {/* Checkbox */}
                        <div className="flex items-start pt-1 shrink-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!available}
                            onChange={(e) => handleToggleSelect(item.id, e.target.checked)}
                            className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-500"
                          />
                        </div>

                        {/* Image */}
                        <button
                          onClick={() => product && navigate(`/product/${product.id}`)}
                          className="h-20 w-20 sm:h-24 sm:w-24 rounded-lg overflow-hidden bg-cream-100 shrink-0"
                        >
                          {primaryImg ? (
                            <img src={primaryImg.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-brand-300">
                              <Package className="h-8 w-8" />
                            </div>
                          )}
                        </button>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <button
                                onClick={() => product && navigate(`/product/${product.id}`)}
                                className="text-sm font-semibold text-brand-900 hover:text-brand-600 transition-colors line-clamp-2 text-left"
                              >
                                {product?.title ?? 'Unknown product'}
                              </button>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {product && <Badge variant="default">{getConditionLabel(product.condition)}</Badge>}
                                {hasSaleDiscount && <Badge variant="accent">On Sale</Badge>}
                                {hasBulkDiscount && <Badge variant="brand">Bulk Discount</Badge>}
                                {stockLow && available && <Badge variant="warning">Only {product?.stock} left</Badge>}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemove(item.id)}
                              className="text-brand-400 hover:text-red-500 transition-colors p-1 shrink-0"
                              aria-label="Remove item"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Availability warning */}
                          {!available && reason && (
                            <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
                              <AlertCircle className="h-3.5 w-3.5" /> {reason}
                            </div>
                          )}
                          {overStock && (
                            <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
                              <AlertCircle className="h-3.5 w-3.5" /> Only {maxQty} in stock — quantity adjusted
                            </div>
                          )}

                          {/* Price + qty controls */}
                          {available && (
                            <div className="flex items-end justify-between gap-3 mt-3 flex-wrap">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center border border-brand-200 rounded-lg">
                                  <button
                                    onClick={() => handleUpdateQty(item.id, item.quantity - 1, maxQty)}
                                    className="px-2.5 h-8 text-brand-600 hover:bg-brand-50 rounded-l-lg transition-colors"
                                    disabled={updatingId === item.id}
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="px-3 text-sm font-medium min-w-[2rem] text-center">{item.quantity}</span>
                                  <button
                                    onClick={() => handleUpdateQty(item.id, item.quantity + 1, maxQty)}
                                    className="px-2.5 h-8 text-brand-600 hover:bg-brand-50 rounded-r-lg transition-colors disabled:opacity-40"
                                    disabled={updatingId === item.id || item.quantity >= maxQty}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <button
                                  onClick={() => handleToggleSave(item.id, true)}
                                  className="text-xs text-brand-500 hover:text-brand-700 transition-colors flex items-center gap-1"
                                >
                                  <Bookmark className="h-3.5 w-3.5" /> Save for later
                                </button>
                              </div>
                              <div className="text-right">
                                {hasBulkDiscount && (
                                  <p className="text-xs text-brand-400 line-through">{formatCurrency(effectivePrice * item.quantity)}</p>
                                )}
                                <p className="text-sm font-bold text-brand-900">
                                  {formatCurrency(bulkPrice * item.quantity)}
                                </p>
                                {hasBulkDiscount && (
                                  <p className="text-xs text-accent-600">
                                    {formatCurrency(bulkPrice)} ea
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {!available && (
                            <div className="flex items-center gap-3 mt-3">
                              <button
                                onClick={() => handleToggleSave(item.id, true)}
                                className="text-xs text-brand-500 hover:text-brand-700 transition-colors flex items-center gap-1"
                              >
                                <Bookmark className="h-3.5 w-3.5" /> Save for later
                              </button>
                              <button
                                onClick={() => handleRemove(item.id)}
                                className="text-xs text-brand-500 hover:text-red-600 transition-colors flex items-center gap-1"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Saved for later section */}
          {savedItems.length > 0 && (
            <div className="bg-white rounded-xl border border-brand-100 overflow-hidden">
              <div className="px-4 py-3 bg-brand-50/60 border-b border-brand-100">
                <h2 className="text-sm font-semibold text-brand-800 flex items-center gap-2">
                  <Bookmark className="h-4 w-4 text-brand-600" />
                  Saved for Later ({savedItems.length})
                </h2>
              </div>
              <div className="divide-y divide-brand-50">
                {savedItems.map((item) => {
                  const product = item.product;
                  const primaryImg = product?.product_images?.find((img) => img.is_primary) ?? product?.product_images?.[0];
                  const price = getEffectivePrice(product);

                  return (
                    <div key={item.id} className="flex gap-3 sm:gap-4 p-4">
                      <button
                        onClick={() => product && navigate(`/product/${product.id}`)}
                        className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg overflow-hidden bg-cream-100 shrink-0"
                      >
                        {primaryImg ? (
                          <img src={primaryImg.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-brand-300">
                            <Package className="h-7 w-7" />
                          </div>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => product && navigate(`/product/${product.id}`)}
                          className="text-sm font-semibold text-brand-900 hover:text-brand-600 transition-colors line-clamp-1 text-left"
                        >
                          {product?.title ?? 'Unknown product'}
                        </button>
                        {product?.seller?.shop_name && (
                          <p className="text-xs text-brand-500 mt-0.5">by {product.seller.shop_name}</p>
                        )}
                        <p className="text-sm font-bold text-brand-800 mt-1">{formatCurrency(price)}</p>
                        {product && product.stock === 0 && (
                          <p className="text-xs text-red-500 mt-1">Currently out of stock</p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <button
                            onClick={() => handleToggleSave(item.id, false)}
                            className="text-xs font-medium text-brand-600 hover:text-brand-800 transition-colors flex items-center gap-1"
                            disabled={updatingId === item.id}
                          >
                            <Plus className="h-3.5 w-3.5" /> Move to cart
                          </button>
                          <button
                            onClick={() => handleRemove(item.id)}
                            className="text-xs text-brand-400 hover:text-red-500 transition-colors flex items-center gap-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-brand-100 p-5 sticky top-24">
            <h2 className="text-lg font-semibold text-brand-900 mb-4">Order Summary</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-brand-500">Selected items</span>
                <span className="font-medium text-brand-900">{selectedItems.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-500">Subtotal</span>
                <span className="font-medium text-brand-900">{formatCurrency(subtotal)}</span>
              </div>
              {totalSavings > 0 && (
                <div className="flex justify-between">
                  <span className="text-accent-600">You save</span>
                  <span className="font-medium text-accent-600">-{formatCurrency(totalSavings)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-brand-500">Shipping</span>
                <span className="text-brand-500">Calculated at checkout</span>
              </div>
            </div>
            <div className="border-t border-brand-100 mt-4 pt-4">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold text-brand-900">Estimated Total</span>
                <span className="text-xl font-bold text-brand-800">{formatCurrency(subtotal)}</span>
              </div>
            </div>

            <Button
              className="w-full mt-5"
              size="lg"
              disabled={selectedItems.length === 0}
              onClick={() => navigate('/checkout')}
            >
              Proceed to Checkout
              <ChevronRight className="h-4 w-4" />
            </Button>

            {selectedItems.length === 0 && activeItems.length > 0 && (
              <p className="text-xs text-brand-400 text-center mt-3">
                Select items to checkout
              </p>
            )}

            {selectedItems.length > 0 && (
              <div className="mt-4 pt-4 border-t border-brand-50">
                <p className="text-xs text-brand-400 flex items-start gap-1.5">
                  <Check className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                  Items from {new Set(selectedItems.map((i) => i.product?.seller_id)).size} store{new Set(selectedItems.map((i) => i.product?.seller_id)).size !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Clear cart confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in" onClick={() => setShowClearConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-brand-900">Clear cart?</h3>
            </div>
            <p className="text-sm text-brand-500 mb-5">
              This will remove {activeItems.length} item{activeItems.length !== 1 ? 's' : ''} from your cart. Saved items will not be affected.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={handleClearCart}>Clear Cart</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
