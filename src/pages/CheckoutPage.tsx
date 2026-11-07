import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, MapPin, Store, Package, Truck, Banknote,
  Wallet, CreditCard, Smartphone, AlertCircle, ShoppingBag, CheckCircle2, Plus,
  Ticket, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type {
  BulkPricingTier, CartItemWithRelations, Municipality, PaymentMethod,
  ProductWithRelations, UserAddress,
} from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { LocationSelect } from '@/components/location/LocationSelect';
import { FormAlert } from '@/components/auth/AuthLayout';
import { formatCurrency, getConditionLabel, getPaymentMethodLabel } from '@/lib/utils';
import { validateCouponCode, redeemCoupon, type ValidateCouponResult } from '@/lib/promotions';

type DeliveryType = 'delivery' | 'pickup';

interface AddressRow extends UserAddress {
  municipality: { name: string } | null;
  barangay: { name: string } | null;
}

interface SellerGroup {
  sellerId: string;
  shopName: string;
  shopSlug: string | null;
  items: CartItemWithRelations[];
}

interface NewAddressDraft {
  label: string;
  recipientName: string;
  phone: string;
  municipalityId: string;
  barangayId: string;
  street: string;
  landmark: string;
}

const STEPS = ['Review', 'Address', 'Delivery', 'Payment', 'Confirm'] as const;
const SHIPPING_FEE = 50;

function getEffectivePrice(product: ProductWithRelations | undefined): number {
  if (!product) return 0;
  const now = new Date();
  const promoActive =
    product.promotion_start_at && product.promotion_end_at &&
    new Date(product.promotion_start_at) <= now && new Date(product.promotion_end_at) >= now;
  if (promoActive && product.sale_price != null) return product.sale_price;
  return product.sale_price ?? product.price;
}

function getBulkAdjustedPrice(
  product: ProductWithRelations | undefined,
  quantity: number,
  tiers: BulkPricingTier[],
): number {
  const base = getEffectivePrice(product);
  if (!product || tiers.length === 0) return base;
  const productTiers = tiers
    .filter((t) => t.product_id === product.id)
    .sort((a, b) => b.min_quantity - a.min_quantity);
  const applicable = productTiers.find(
    (t) => quantity >= t.min_quantity && (t.max_quantity == null || quantity <= t.max_quantity),
  );
  if (applicable) return base * (1 - applicable.discount_percentage / 100);
  return base;
}

function isItemAvailable(item: CartItemWithRelations): { available: boolean; reason?: string } {
  const product = item.product;
  if (!product) return { available: false, reason: 'Product no longer available' };
  if (product.status === 'sold_out' || product.status === 'archived') return { available: false, reason: 'No longer available' };
  if (product.status !== 'published') return { available: false, reason: 'Currently unavailable' };
  if (product.stock === 0) return { available: false, reason: 'Out of stock' };
  if (item.quantity > product.stock) return { available: false, reason: `Only ${product.stock} left in stock` };
  return { available: true };
}

const paymentOptions: { value: PaymentMethod; label: string; icon: typeof Banknote; hint: string }[] = [
  { value: 'cod', label: 'Cash on Delivery', icon: Banknote, hint: 'Pay with cash when you receive your order' },
  { value: 'gcash', label: 'GCash', icon: Smartphone, hint: 'Send payment via GCash after order confirmation' },
  { value: 'maya', label: 'Maya', icon: Wallet, hint: 'Pay via Maya wallet' },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: CreditCard, hint: 'Direct bank deposit or transfer' },
  { value: 'card', label: 'Credit/Debit Card', icon: CreditCard, hint: 'Pay with Visa or Mastercard' },
];

const emptyDraft: NewAddressDraft = {
  label: 'Home', recipientName: '', phone: '', municipalityId: '', barangayId: '', street: '', landmark: '',
};

export function CheckoutPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItemWithRelations[]>([]);
  const [bulkTiers, setBulkTiers] = useState<BulkPricingTier[]>([]);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('delivery');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrders, setCreatedOrders] = useState<{ order_id: string; order_number: string; seller_id: string; total: number }[]>([]);
  const [addAddressOpen, setAddAddressOpen] = useState(false);
  const [draft, setDraft] = useState<NewAddressDraft>(emptyDraft);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [savingAddress, setSavingAddress] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponResult, setCouponResult] = useState<ValidateCouponResult | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const fetchInitial = useCallback(async () => {
    if (!user) return;
    const { data: cart } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!cart) {
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
      .eq('saved_for_later', false)
      .eq('selected_for_checkout', true)
      .order('created_at', { ascending: false });
    const cartItems = (itemData as CartItemWithRelations[]) ?? [];
    setItems(cartItems);

    const productIds = cartItems.map((i) => i.product?.id).filter((id): id is string => !!id);
    if (productIds.length > 0) {
      const { data: tiers } = await supabase
        .from('bulk_pricing_tiers')
        .select('*')
        .in('product_id', productIds)
        .order('min_quantity', { ascending: true });
      setBulkTiers((tiers as BulkPricingTier[]) ?? []);
    }

    const [addrRes, muniRes] = await Promise.all([
      supabase.from('user_addresses')
        .select('*, municipality:municipalities(name), barangay:barangays(name)')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true }),
      supabase.from('municipalities').select('*').order('name'),
    ]);
    const addrList = (addrRes.data as AddressRow[] | null) ?? [];
    setAddresses(addrList);
    setMunicipalities((muniRes.data as Municipality[] | null) ?? []);
    const defaultAddr = addrList.find((a) => a.is_default) ?? addrList[0];
    if (defaultAddr) setSelectedAddressId(defaultAddr.id);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const sellerGroups = useMemo<SellerGroup[]>(() => {
    const map = new Map<string, SellerGroup>();
    items.forEach((item) => {
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
  }, [items]);

  const unavailableItems = useMemo(() => items.filter((i) => !isItemAvailable(i).available), [items]);

  const groupSubtotals = useMemo(() => {
    const map = new Map<string, number>();
    sellerGroups.forEach((g) => {
      const sub = g.items.reduce((sum, item) => {
        const price = getBulkAdjustedPrice(item.product, item.quantity, bulkTiers);
        return sum + price * item.quantity;
      }, 0);
      map.set(g.sellerId, sub);
    });
    return map;
  }, [sellerGroups, bulkTiers]);

  const subtotal = useMemo(() =>
    Array.from(groupSubtotals.values()).reduce((sum, s) => sum + s, 0), [groupSubtotals]);

  const totalShipping = deliveryType === 'delivery' ? sellerGroups.length * SHIPPING_FEE : 0;
  const couponDiscount = couponResult?.valid ? couponResult.discount_amount : 0;
  const grandTotal = Math.max(0, subtotal + totalShipping - couponDiscount);

  const selectedAddress = useMemo(() => addresses.find((a) => a.id === selectedAddressId) ?? null, [addresses, selectedAddressId]);

  const canProceed = useMemo(() => {
    if (items.length === 0) return false;
    if (unavailableItems.length > 0) return false;
    if (step === 1) return deliveryType === 'pickup' || !!selectedAddressId;
    if (step === 2) return !!deliveryType;
    if (step === 3) return !!paymentMethod;
    return true;
  }, [items.length, unavailableItems.length, step, deliveryType, selectedAddressId, paymentMethod]);

  const handleSaveAddress = async () => {
    const errs: Record<string, string> = {};
    if (!draft.label.trim()) errs.label = 'Label is required';
    if (draft.recipientName.trim().length < 2) errs.recipientName = 'Enter recipient name';
    if (!draft.phone.trim()) errs.phone = 'Enter contact number';
    if (!draft.municipalityId) errs.municipalityId = 'Select municipality';
    if (!draft.barangayId) errs.barangayId = 'Select barangay';
    if (!draft.street.trim()) errs.street = 'Enter street details';
    setDraftErrors(errs);
    if (Object.values(errs).some(Boolean)) return;

    setSavingAddress(true);
    const { data, error: insErr } = await supabase.from('user_addresses').insert({
      label: draft.label.trim(),
      recipient_name: draft.recipientName.trim(),
      phone: draft.phone.trim(),
      municipality_id: draft.municipalityId,
      barangay_id: draft.barangayId,
      street: draft.street.trim(),
      landmark: draft.landmark.trim() || null,
    }).select('id');
    setSavingAddress(false);
    if (insErr || !data || data.length === 0) {
      setError('Could not save address. Please try again.');
      return;
    }
    const newId = data[0].id;
    const { data: addrData } = await supabase.from('user_addresses')
      .select('*, municipality:municipalities(name), barangay:barangays(name)')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    setAddresses((addrData as AddressRow[] | null) ?? []);
    setSelectedAddressId(newId);
    setAddAddressOpen(false);
    setDraft(emptyDraft);
    setDraftErrors({});
  };

  const handleApplyCoupon = async () => {
    if (!user || !couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError(null);
    setCouponResult(null);
    try {
      const result = await validateCouponCode(couponCode.trim(), user.id, subtotal);
      if (result.valid) {
        setCouponResult(result);
      } else {
        setCouponError(result.reason ?? 'Coupon could not be applied.');
      }
    } catch (e) {
      setCouponError(e instanceof Error ? e.message : 'Could not validate coupon.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode('');
    setCouponResult(null);
    setCouponError(null);
  };

  const handlePlaceOrder = async () => {
    if (!user || items.length === 0) return;
    setSubmitting(true);
    setError(null);

    const cartItemIds = items.map((i) => i.id);
    const addressJson = selectedAddress ? {
      recipient_name: selectedAddress.recipient_name,
      phone: selectedAddress.phone,
      street: `${selectedAddress.street}, ${selectedAddress.barangay?.name ?? ''}, ${selectedAddress.municipality?.name ?? ''}`,
      municipality_id: selectedAddress.municipality_id,
      barangay_id: selectedAddress.barangay_id,
    } : null;

    const { data, error: rpcErr } = await supabase.rpc('create_checkout_orders', {
      p_cart_item_ids: cartItemIds,
      p_delivery_type: deliveryType,
      p_address: addressJson,
      p_payment_method: paymentMethod,
      p_notes: notes.trim() || null,
    });

    if (rpcErr) {
      setSubmitting(false);
      setError(rpcErr.message.replace(/^ERROR:\s*/, ''));
      return;
    }

    const orders = (data as { order_id: string; order_number: string; seller_id: string; total: number }[]) ?? [];

    // Redeem coupon if a valid one was applied — find the order from the matching seller
    if (couponResult?.valid && couponResult.coupon_id && user) {
      const matchingOrder = orders.find((o) => o.seller_id === couponResult.seller_id) ?? orders[0];
      if (matchingOrder) {
        try {
          const redeem = await redeemCoupon(couponResult.coupon_id, user.id, matchingOrder.order_id, couponResult.discount_amount);
          if (redeem.success) {
            // Update the order with the coupon discount snapshot
            await supabase.from('orders').update({
              coupon_discount: couponResult.discount_amount,
              coupon_id: couponResult.coupon_id,
              total: Math.max(0, matchingOrder.total - couponResult.discount_amount),
            }).eq('id', matchingOrder.order_id);
          }
        } catch {
          // Coupon redemption failed (e.g. race condition) — order still proceeds without discount
        }
      }
    }

    setCreatedOrders(orders);
    setSubmitting(false);
    setStep(5); // confirmation
  };

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
        <div className="h-8 bg-cream-100 rounded w-1/3" />
        <div className="h-40 bg-cream-100 rounded-xl" />
      </div>
    );
  }

  // Confirmation page
  if (step === 5 && createdOrders.length > 0) {
    return (
      <div className="container-app max-w-2xl py-8 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600 mb-4">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-brand-900 mb-2">Order placed successfully!</h1>
          <p className="text-sm text-brand-500">
            {createdOrders.length} order{createdOrders.length !== 1 ? 's' : ''} created from your checkout.
            Sellers will be notified to prepare your items.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {createdOrders.map((o) => (
            <div key={o.order_id} className="bg-white rounded-xl border border-brand-100 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-brand-900">{o.order_number}</p>
                <p className="text-xs text-brand-400">Total: {formatCurrency(o.total)}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate('/orders')}>
                View Orders
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => navigate('/browse')}>Continue Shopping</Button>
          <Button onClick={() => navigate('/orders')}>View My Orders</Button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container-app py-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-brand-900 mb-6">Checkout</h1>
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" />}
          title="No items selected for checkout"
          description="Go to your cart and select the items you want to purchase."
          action={<Button onClick={() => navigate('/cart')}>Go to Cart</Button>}
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/cart')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to cart
      </button>

      <h1 className="text-2xl font-bold text-brand-900 mb-6">Checkout</h1>

      {/* Progress indicator */}
      <div className="flex items-center gap-1 sm:gap-2 mb-8 overflow-x-auto pb-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center shrink-0">
            <div className={`flex items-center gap-2 ${i <= step ? 'text-brand-700' : 'text-brand-300'}`}>
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-400'}`}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className="text-sm font-medium hidden sm:inline">{label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`w-4 sm:w-8 h-0.5 mx-1 ${i < step ? 'bg-brand-600' : 'bg-brand-100'}`} />}
          </div>
        ))}
      </div>

      {error && <div className="mb-6"><FormAlert tone="error">{error}</FormAlert></div>}

      {unavailableItems.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Some items are unavailable</p>
              <ul className="mt-1 text-sm text-amber-700 space-y-0.5">
                {unavailableItems.map((item) => (
                  <li key={item.id}>
                    {item.product?.title ?? 'Unknown'} — {isItemAvailable(item).reason}
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate('/cart')}>
                Return to cart to fix
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main content by step */}
        <div className="lg:col-span-2">
          {/* Step 0: Review items */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-brand-900">Review Your Items</h2>
              {sellerGroups.map((group) => (
                <div key={group.sellerId} className="bg-white rounded-xl border border-brand-100 overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-brand-50/60 border-b border-brand-100">
                    <Store className="h-4 w-4 text-brand-600" />
                    <button
                      onClick={() => group.shopSlug && navigate(`/seller/${group.shopSlug}`)}
                      className="text-sm font-semibold text-brand-800 hover:text-brand-600 transition-colors"
                    >
                      {group.shopName}
                    </button>
                    <span className="text-sm text-brand-500 ml-auto">
                      {formatCurrency(groupSubtotals.get(group.sellerId) ?? 0)}
                    </span>
                  </div>
                  <div className="divide-y divide-brand-50">
                    {group.items.map((item) => {
                      const product = item.product;
                      const primaryImg = product?.product_images?.find((img) => img.is_primary) ?? product?.product_images?.[0];
                      const price = getBulkAdjustedPrice(product, item.quantity, bulkTiers);
                      const basePrice = getEffectivePrice(product);
                      const hasDiscount = price < basePrice;
                      const { available, reason } = isItemAvailable(item);
                      return (
                        <div key={item.id} className={`flex gap-3 p-4 ${!available ? 'opacity-60' : ''}`}>
                          <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg overflow-hidden bg-cream-100 shrink-0">
                            {primaryImg ? (
                              <img src={primaryImg.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-brand-300">
                                <Package className="h-7 w-7" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-brand-900 line-clamp-1">{product?.title ?? 'Unknown'}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {product && <Badge variant="default">{getConditionLabel(product.condition)}</Badge>}
                              <span className="text-xs text-brand-400">Qty: {item.quantity}</span>
                            </div>
                            {!available && reason && (
                              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> {reason}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            {hasDiscount && <p className="text-xs text-brand-400 line-through">{formatCurrency(basePrice * item.quantity)}</p>}
                            <p className="text-sm font-bold text-brand-900">{formatCurrency(price * item.quantity)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 1: Address */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-brand-900">Delivery Address</h2>

              {deliveryType === 'pickup' ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                  You selected pickup. The seller's pickup location will be shown in your order details.
                  You can switch to delivery to choose an address.
                </div>
              ) : (
                <>
                  {addresses.length === 0 ? (
                    <div className="bg-white rounded-xl border border-brand-100 p-6 text-center">
                    <MapPin className="h-8 w-8 text-brand-300 mx-auto mb-3" />
                    <p className="text-sm text-brand-600 mb-4">No saved addresses yet. Add one to continue.</p>
                    <Button onClick={() => setAddAddressOpen(true)}><Plus className="h-4 w-4" /> Add Address</Button>
                  </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {addresses.map((addr) => (
                          <label
                            key={addr.id}
                            className={`block rounded-xl border bg-white p-4 cursor-pointer transition-all ${selectedAddressId === addr.id ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-brand-100 hover:border-brand-300'}`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="radio"
                                name="address"
                                checked={selectedAddressId === addr.id}
                                onChange={() => setSelectedAddressId(addr.id)}
                                className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-brand-900">{addr.label}</span>
                                  {addr.is_default && <Badge variant="brand">Default</Badge>}
                                </div>
                                <p className="text-sm text-brand-700 mt-1">{addr.recipient_name}</p>
                                <p className="text-sm text-brand-500">{addr.phone}</p>
                                <p className="text-sm text-brand-600 mt-1">
                                  {addr.street}, {addr.barangay?.name}, {addr.municipality?.name}
                                </p>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                      <Button variant="outline" onClick={() => setAddAddressOpen(true)}>
                        <Plus className="h-4 w-4" /> Add new address
                      </Button>
                    </>
                  )}
                </>
              )}

              {/* Delivery type toggle */}
              <div className="bg-white rounded-xl border border-brand-100 p-4">
                <p className="text-sm font-semibold text-brand-900 mb-3">Delivery Method</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-all ${deliveryType === 'delivery' ? 'border-brand-500 bg-brand-50' : 'border-brand-200 hover:border-brand-300'}`}>
                    <input type="radio" checked={deliveryType === 'delivery'} onChange={() => setDeliveryType('delivery')} className="h-4 w-4 text-brand-600" />
                    <Truck className="h-4 w-4 text-brand-600" />
                    <div>
                      <p className="text-sm font-medium text-brand-900">Delivery</p>
                      <p className="text-xs text-brand-500">Ship to your address</p>
                    </div>
                  </label>
                  <label className={`flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-all ${deliveryType === 'pickup' ? 'border-brand-500 bg-brand-50' : 'border-brand-200 hover:border-brand-300'}`}>
                    <input type="radio" checked={deliveryType === 'pickup'} onChange={() => setDeliveryType('pickup')} className="h-4 w-4 text-brand-600" />
                    <Store className="h-4 w-4 text-brand-600" />
                    <div>
                      <p className="text-sm font-medium text-brand-900">Pickup</p>
                      <p className="text-xs text-brand-500">Collect from seller</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Delivery details */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-brand-900">Delivery Details</h2>
              <div className="bg-white rounded-xl border border-brand-100 p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  {deliveryType === 'delivery' ? <Truck className="h-5 w-5 text-brand-600" /> : <Store className="h-5 w-5 text-brand-600" />}
                  <div>
                    <p className="text-sm font-semibold text-brand-900">
                      {deliveryType === 'delivery' ? 'Standard Delivery' : 'Store Pickup'}
                    </p>
                    <p className="text-xs text-brand-500">
                      {deliveryType === 'delivery'
                        ? 'Items delivered within Marinduque (1-3 days)'
                        : 'Coordinate pickup with each seller after order confirmation'}
                    </p>
                  </div>
                </div>

                {deliveryType === 'delivery' && selectedAddress && (
                  <div className="bg-brand-50/60 rounded-lg p-3">
                    <p className="text-xs text-brand-500 mb-1">Delivering to:</p>
                    <p className="text-sm font-medium text-brand-900">{selectedAddress.recipient_name}</p>
                    <p className="text-sm text-brand-600">{selectedAddress.phone}</p>
                    <p className="text-sm text-brand-600">
                      {selectedAddress.street}, {selectedAddress.barangay?.name}, {selectedAddress.municipality?.name}
                    </p>
                  </div>
                )}

                <div className="text-sm text-brand-600 space-y-1">
                  <p>Shipping fee: {formatCurrency(SHIPPING_FEE)} per seller store</p>
                  <p>{sellerGroups.length} store{sellerGroups.length !== 1 ? 's' : ''} in this order = {formatCurrency(totalShipping)} shipping</p>
                </div>

                <Textarea
                  label="Order notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Special delivery instructions, landmarks, preferred delivery times..."
                />
              </div>
            </div>
          )}

          {/* Step 3: Payment */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-brand-900">Payment Method</h2>
              <div className="space-y-3">
                {paymentOptions.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 rounded-xl border bg-white p-4 cursor-pointer transition-all ${paymentMethod === opt.value ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-brand-100 hover:border-brand-300'}`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        checked={paymentMethod === opt.value}
                        onChange={() => setPaymentMethod(opt.value)}
                        className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                      />
                      <Icon className="h-5 w-5 text-brand-600" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-brand-900">{opt.label}</p>
                        <p className="text-xs text-brand-500">{opt.hint}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                Payment will be processed after your order is confirmed. The seller will provide payment instructions for your chosen method.
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-brand-900">Review & Confirm</h2>

              {sellerGroups.map((group) => (
                <div key={group.sellerId} className="bg-white rounded-xl border border-brand-100 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-brand-50/60 border-b border-brand-100">
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-brand-600" />
                      <span className="text-sm font-semibold text-brand-800">{group.shopName}</span>
                    </div>
                    <span className="text-sm font-bold text-brand-900">
                      {formatCurrency((groupSubtotals.get(group.sellerId) ?? 0) + (deliveryType === 'delivery' ? SHIPPING_FEE : 0))}
                    </span>
                  </div>
                  <div className="divide-y divide-brand-50">
                    {group.items.map((item) => {
                      const product = item.product;
                      const price = getBulkAdjustedPrice(product, item.quantity, bulkTiers);
                      return (
                        <div key={item.id} className="flex items-center justify-between p-3 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium text-brand-800 truncate">{product?.title ?? 'Unknown'}</p>
                            <p className="text-xs text-brand-400">{item.quantity} × {formatCurrency(getEffectivePrice(product))}</p>
                          </div>
                          <span className="font-semibold text-brand-900 ml-3">{formatCurrency(price * item.quantity)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="bg-white rounded-xl border border-brand-100 p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-brand-500">Delivery</span>
                  <span className="text-brand-800">{deliveryType === 'delivery' ? 'Standard delivery' : 'Store pickup'}</span>
                </div>
                {deliveryType === 'delivery' && selectedAddress && (
                  <div className="flex justify-between gap-3">
                    <span className="text-brand-500 shrink-0">Address</span>
                    <span className="text-brand-800 text-right">
                      {selectedAddress.recipient_name}, {selectedAddress.street}, {selectedAddress.barangay?.name}, {selectedAddress.municipality?.name}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-brand-500">Payment</span>
                  <span className="text-brand-800">{getPaymentMethodLabel(paymentMethod)}</span>
                </div>
                {notes && (
                  <div className="flex justify-between gap-3">
                    <span className="text-brand-500 shrink-0">Notes</span>
                    <span className="text-brand-800 text-right">{notes}</span>
                  </div>
                )}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <p>By confirming, you agree to purchase these items. Stock will be reserved and sellers will be notified. Payment instructions will follow based on your chosen method.</p>
              </div>
            </div>
          )}
        </div>

        {/* Order summary sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-brand-100 p-5 sticky top-24">
            <h2 className="text-lg font-semibold text-brand-900 mb-4">Order Summary</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-brand-500">Items ({items.length})</span>
                <span className="font-medium text-brand-900">{formatCurrency(subtotal)}</span>
              </div>
              {deliveryType === 'delivery' && (
                <div className="flex justify-between">
                  <span className="text-brand-500">Shipping ({sellerGroups.length} store{sellerGroups.length !== 1 ? 's' : ''})</span>
                  <span className="font-medium text-brand-900">{formatCurrency(totalShipping)}</span>
                </div>
              )}
              {couponDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span className="flex items-center gap-1">
                    <Ticket className="h-3.5 w-3.5" /> Coupon discount
                  </span>
                  <span className="font-medium">-{formatCurrency(couponDiscount)}</span>
                </div>
              )}
            </div>

            {/* Coupon input — visible from the payment step onward */}
            {step >= 3 && step < 5 && (
              <div className="mt-4 pt-4 border-t border-brand-100">
                {couponResult?.valid ? (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Ticket className="h-4 w-4 text-green-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-green-800 truncate">
                          {couponCode.trim().toUpperCase()} applied
                        </p>
                        <p className="text-xs text-green-600">
                          {couponResult.discount_type === 'percentage'
                            ? `${couponResult.discount_amount > 0 ? formatCurrency(couponResult.discount_amount) : ''} off`
                            : `${formatCurrency(couponResult.discount_amount)} off`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleRemoveCoupon}
                      className="text-green-600 hover:text-green-800 shrink-0 p-1"
                      aria-label="Remove coupon"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-brand-600 mb-1.5">
                      Have a coupon code?
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => { setCouponCode(e.target.value); setCouponError(null); }}
                        placeholder="Enter code"
                        className="flex-1 rounded-lg border border-brand-200 px-3 py-2 text-sm uppercase placeholder:normal-case focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCoupon(); } }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleApplyCoupon}
                        loading={couponLoading}
                        disabled={!couponCode.trim()}
                      >
                        Apply
                      </Button>
                    </div>
                    {couponError && (
                      <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {couponError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-brand-100 mt-4 pt-4">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold text-brand-900">Total</span>
                <span className="text-xl font-bold text-brand-800">{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            {/* Navigation buttons */}
            <div className="mt-5 space-y-2">
              {step > 0 && step < 5 && (
                <Button variant="outline" className="w-full" onClick={() => setStep(step - 1)} disabled={submitting}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              )}
              {step < 4 && (
                <Button
                  className="w-full"
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceed || unavailableItems.length > 0}
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {step === 4 && (
                <Button
                  className="w-full"
                  onClick={handlePlaceOrder}
                  loading={submitting}
                  disabled={unavailableItems.length > 0}
                >
                  <Check className="h-4 w-4" /> Place Order
                </Button>
              )}
            </div>

            {step === 0 && unavailableItems.length === 0 && items.length > 0 && (
              <p className="text-xs text-brand-400 text-center mt-3">
                {sellerGroups.length} store{sellerGroups.length !== 1 ? 's' : ''} • {items.length} item{items.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Add address modal */}
      <Modal open={addAddressOpen} onClose={() => setAddAddressOpen(false)} title="Add Delivery Address" size="lg">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Label"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              error={draftErrors.label}
              placeholder="Home, Office..."
            />
            <Input
              label="Recipient name"
              value={draft.recipientName}
              onChange={(e) => setDraft({ ...draft, recipientName: e.target.value })}
              error={draftErrors.recipientName}
            />
          </div>
          <Input
            label="Contact number"
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            error={draftErrors.phone}
            placeholder="09XX XXX XXXX"
          />
          <LocationSelect
            municipalities={municipalities}
            municipalityId={draft.municipalityId}
            barangayId={draft.barangayId}
            onMunicipalityChange={(id) => setDraft({ ...draft, municipalityId: id, barangayId: '' })}
            onBarangayChange={(id) => setDraft({ ...draft, barangayId: id })}
            municipalityError={draftErrors.municipalityId}
            barangayError={draftErrors.barangayId}
          />
          <Input
            label="Street and house details"
            value={draft.street}
            onChange={(e) => setDraft({ ...draft, street: e.target.value })}
            error={draftErrors.street}
            placeholder="House no., street, purok"
          />
          <Input
            label="Landmark (optional)"
            value={draft.landmark}
            onChange={(e) => setDraft({ ...draft, landmark: e.target.value })}
            placeholder="Near the school, beside the chapel..."
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setAddAddressOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveAddress} loading={savingAddress}>Save Address</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
