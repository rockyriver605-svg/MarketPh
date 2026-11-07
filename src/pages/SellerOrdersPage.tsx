import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Package, ArrowLeft, Truck, Banknote, CreditCard, Smartphone, Wallet, MapPin,
  Check, X, Clock, Store, ChevronDown, ChevronUp, AlertTriangle, ShoppingCart,
  Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { Order, OrderItem, Payment, Delivery, OrderStatusHistory, OrderDispute, SellerProfile } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Textarea, Input } from '@/components/ui/Input';
import { FormAlert } from '@/components/auth/AuthLayout';
import { formatCurrency, formatDateTime, getOrderStatusLabel, getPaymentMethodLabel } from '@/lib/utils';

interface SellerOrder extends Order {
  order_items: OrderItem[];
  payments: Payment[];
  deliveries: Delivery[];
  status_history: OrderStatusHistory[];
  disputes: OrderDispute[];
  buyer: { id: string; display_name: string; username: string | null; avatar_url: string | null } | null;
}

function paymentIcon(method: string | null) {
  switch (method) {
    case 'cod': return Banknote;
    case 'gcash': return Smartphone;
    case 'maya': return Wallet;
    default: return CreditCard;
  }
}

function statusBadgeVariant(status: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'completed': case 'delivered': case 'paid': return 'success';
    case 'pending': case 'confirmed': case 'processing': case 'ready_for_pickup':
    case 'shipped': case 'in_transit': case 'out_for_delivery': case 'partial': return 'info';
    case 'cancelled': case 'failed': case 'returned': return 'error';
    case 'refunded': case 'picked_up': case 'disputed': return 'warning';
    default: return 'default';
  }
}

function getDeliveryStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending', picked_up: 'Picked Up', in_transit: 'In Transit',
    out_for_delivery: 'Out for Delivery', delivered: 'Delivered', failed: 'Failed', returned: 'Returned',
  };
  return labels[status] ?? status;
}

function getPaymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending', paid: 'Paid', failed: 'Failed', refunded: 'Refunded', partial: 'Partial',
  };
  return labels[status] ?? status;
}

function getDisputeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: 'Open', under_review: 'Under Review', resolved: 'Resolved', dismissed: 'Dismissed',
  };
  return labels[status] ?? status;
}

export function SellerOrdersPage() {
  const { user } = useAuth();
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [rejectOrder, setRejectOrder] = useState<SellerOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [trackingOrder, setTrackingOrder] = useState<SellerOrder | null>(null);
  const [trackingForm, setTrackingForm] = useState({ courier: '', tracking_number: '', estimated_delivery: '', notes: '' });
  const [trackingError, setTrackingError] = useState<string | null>(null);

  const loadSellerProfile = useCallback(async () => {
    if (!user) return null;
    const { data } = await supabase
      .from('seller_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    const profile = data as SellerProfile | null;
    setSellerProfile(profile);
    return profile;
  }, [user]);

  const loadOrders = useCallback(async (profile: SellerProfile) => {
    const { data: itemData } = await supabase
      .from('order_items')
      .select('order_id')
      .eq('seller_id', profile.id);
    const orderIds = Array.from(new Set((itemData as { order_id: string }[] | null)?.map((i) => i.order_id) ?? []));
    if (orderIds.length === 0) {
      setOrders([]);
      setLoading(false);
      return;
    }
    const [ordersRes, itemsRes, paymentsRes, deliveriesRes, historyRes, disputesRes] = await Promise.all([
      supabase.from('orders').select('*').in('id', orderIds).order('created_at', { ascending: false }),
      supabase.from('order_items').select('*').in('order_id', orderIds).eq('seller_id', profile.id),
      supabase.from('payments').select('*').in('order_id', orderIds),
      supabase.from('deliveries').select('*').in('order_id', orderIds),
      supabase.from('order_status_history').select('*').in('order_id', orderIds).order('created_at', { ascending: true }),
      supabase.from('order_disputes').select('*').in('order_id', orderIds).order('created_at', { ascending: false }),
    ]);
    const ordersList = (ordersRes.data as Order[] | null) ?? [];
    const buyerIds = Array.from(new Set(ordersList.map((o) => o.buyer_id)));
    const buyerMap: Record<string, { id: string; display_name: string; username: string | null; avatar_url: string | null }> = {};
    if (buyerIds.length > 0) {
      const { data: buyerData } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', buyerIds);
      (buyerData as { id: string; display_name: string; username: string | null; avatar_url: string | null }[] | null)?.forEach((b) => {
        buyerMap[b.id] = b;
      });
    }

    const itemMap: Record<string, OrderItem[]> = {};
    (itemsRes.data as OrderItem[] | null)?.forEach((i) => {
      if (!itemMap[i.order_id]) itemMap[i.order_id] = [];
      itemMap[i.order_id].push(i);
    });
    const payMap: Record<string, Payment[]> = {};
    (paymentsRes.data as Payment[] | null)?.forEach((p) => {
      if (!payMap[p.order_id]) payMap[p.order_id] = [];
      payMap[p.order_id].push(p);
    });
    const delMap: Record<string, Delivery[]> = {};
    (deliveriesRes.data as Delivery[] | null)?.forEach((d) => {
      if (!delMap[d.order_id]) delMap[d.order_id] = [];
      delMap[d.order_id].push(d);
    });
    const histMap: Record<string, OrderStatusHistory[]> = {};
    (historyRes.data as OrderStatusHistory[] | null)?.forEach((h) => {
      if (!histMap[h.order_id]) histMap[h.order_id] = [];
      histMap[h.order_id].push(h);
    });
    const dispMap: Record<string, OrderDispute[]> = {};
    (disputesRes.data as OrderDispute[] | null)?.forEach((d) => {
      if (!dispMap[d.order_id]) dispMap[d.order_id] = [];
      dispMap[d.order_id].push(d);
    });

    setOrders(ordersList.map((o) => ({
      ...o,
      order_items: itemMap[o.id] ?? [],
      payments: payMap[o.id] ?? [],
      deliveries: delMap[o.id] ?? [],
      status_history: histMap[o.id] ?? [],
      disputes: dispMap[o.id] ?? [],
      buyer: buyerMap[o.buyer_id] ?? null,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const profile = await loadSellerProfile();
      if (profile) await loadOrders(profile);
      else setLoading(false);
    })();
  }, [loadSellerProfile, loadOrders]);

  const filteredOrders = useMemo(() =>
    filter === 'all' ? orders : orders.filter((o) => o.status === filter),
  [orders, filter]);

  const orderStats = useMemo(() => ({
    total: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    active: orders.filter((o) => ['confirmed', 'processing', 'ready_for_pickup', 'shipped'].includes(o.status)).length,
    completed: orders.filter((o) => o.status === 'completed').length,
    revenue: orders.filter((o) => ['completed', 'delivered'].includes(o.status)).reduce((sum, o) => {
      return sum + o.order_items.reduce((s, i) => s + i.subtotal, 0);
    }, 0),
  }), [orders]);

  const filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'processing', label: 'Processing' },
    { value: 'ready_for_pickup', label: 'Ready' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'disputed', label: 'Disputed' },
  ];

  const handleTransition = async (orderId: string, newStatus: string, reason?: string) => {
    setBusyOrderId(orderId);
    setActionError(null);
    const { error: rpcErr } = await supabase.rpc('transition_order_status', {
      p_order_id: orderId,
      p_new_status: newStatus,
      p_reason: reason ?? null,
    });
    setBusyOrderId(null);
    if (rpcErr) {
      setActionError(rpcErr.message.replace(/^ERROR:\s*/, ''));
      return;
    }
    if (sellerProfile) await loadOrders(sellerProfile);
  };

  const handleReject = async () => {
    if (!rejectOrder || !rejectReason.trim()) return;
    setBusyOrderId(rejectOrder.id);
    setActionError(null);
    const { error: rpcErr } = await supabase.rpc('transition_order_status', {
      p_order_id: rejectOrder.id,
      p_new_status: 'cancelled',
      p_reason: `Rejected by seller: ${rejectReason.trim()}`,
    });
    setBusyOrderId(null);
    if (rpcErr) {
      setActionError(rpcErr.message.replace(/^ERROR:\s*/, ''));
      return;
    }
    setRejectOrder(null);
    setRejectReason('');
    if (sellerProfile) await loadOrders(sellerProfile);
  };

  const handleSaveTracking = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!trackingOrder) return;
    setBusyOrderId(trackingOrder.id);
    setTrackingError(null);
    const { error: rpcErr } = await supabase.rpc('update_delivery_tracking', {
      p_order_id: trackingOrder.id,
      p_courier: trackingForm.courier,
      p_tracking_number: trackingForm.tracking_number,
      p_estimated_delivery: trackingForm.estimated_delivery || null,
      p_notes: trackingForm.notes,
    });
    setBusyOrderId(null);
    if (rpcErr) {
      setTrackingError(rpcErr.message.replace(/^ERROR:\s*/, ''));
      return;
    }
    setTrackingOrder(null);
    if (sellerProfile) await loadOrders(sellerProfile);
  };

  if (!user) {
    return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  }

  if (loading) {
    return <div className="container-app py-12 animate-pulse"><div className="h-8 bg-cream-100 rounded w-1/4" /></div>;
  }

  if (!sellerProfile) {
    return (
      <div className="container-app py-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-brand-900 mb-4">Seller Orders</h1>
        <EmptyState
          icon={<Store className="h-8 w-8" />}
          title="No seller account found"
          description="Set up your seller profile to start receiving orders."
          action={<Button onClick={() => navigate('/seller/setup')}>Set Up Store</Button>}
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/seller/dashboard')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </button>
      <h1 className="text-2xl font-bold text-brand-900 mb-2">Seller Orders</h1>
      <p className="text-sm text-brand-500 mb-6">Manage incoming orders for {sellerProfile.shop_name}</p>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-brand-100 p-4">
          <div className="flex items-center gap-2 mb-1"><ShoppingCart className="h-4 w-4 text-brand-500" /><span className="text-xs text-brand-500">Total</span></div>
          <p className="text-xl font-bold text-brand-900">{orderStats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-brand-100 p-4">
          <div className="flex items-center gap-2 mb-1"><Clock className="h-4 w-4 text-amber-500" /><span className="text-xs text-brand-500">Pending</span></div>
          <p className="text-xl font-bold text-brand-900">{orderStats.pending}</p>
        </div>
        <div className="bg-white rounded-xl border border-brand-100 p-4">
          <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4 text-blue-500" /><span className="text-xs text-brand-500">Active</span></div>
          <p className="text-xl font-bold text-brand-900">{orderStats.active}</p>
        </div>
        <div className="bg-white rounded-xl border border-brand-100 p-4">
          <div className="flex items-center gap-2 mb-1"><Check className="h-4 w-4 text-green-500" /><span className="text-xs text-brand-500">Revenue</span></div>
          <p className="text-xl font-bold text-brand-900">{formatCurrency(orderStats.revenue)}</p>
        </div>
      </div>

      {/* Filters */}
      {orders.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto mb-6">
          {filterOptions.map((opt) => (
            <button key={opt.value} onClick={() => setFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0 ${filter === opt.value ? 'bg-brand-600 text-white' : 'bg-white border border-brand-100 text-brand-600 hover:bg-brand-50'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {actionError && <div className="mb-4"><FormAlert tone="error">{actionError}</FormAlert></div>}

      {filteredOrders.length > 0 ? (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const isExpanded = expandedId === order.id;
            const payment = order.payments[0];
            const delivery = order.deliveries[0];
            const PaymentIcon = paymentIcon(payment?.method ?? null);
            const canAccept = order.status === 'pending';
            const canProcess = order.status === 'confirmed';
            const canReady = order.status === 'processing';
            const canShip = order.status === 'ready_for_pickup';
            const canDeliver = order.status === 'shipped';
            const canComplete = order.status === 'delivered';
            const sellerSubtotal = order.order_items.reduce((s, i) => s + i.subtotal, 0);
            const hasOpenDispute = order.disputes.some((d) => d.status === 'open' || d.status === 'under_review');

            return (
              <div key={order.id} className={`bg-white rounded-xl border overflow-hidden ${hasOpenDispute ? 'border-amber-300' : 'border-brand-100'}`}>
                <button onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full flex flex-wrap items-center justify-between gap-3 p-5 text-left hover:bg-brand-50/30 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-brand-900">{order.order_number}</p>
                      {hasOpenDispute && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                    </div>
                    <p className="text-xs text-brand-400">
                      {formatDateTime(order.created_at)}
                      {order.buyer && ` • ${order.buyer.display_name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusBadgeVariant(order.status)}>{getOrderStatusLabel(order.status)}</Badge>
                    <span className="text-lg font-bold text-brand-800">{formatCurrency(sellerSubtotal)}</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-brand-400" /> : <ChevronDown className="h-4 w-4 text-brand-400" />}
                  </div>
                </button>

                {!isExpanded && (
                  <div className="px-5 pb-4 space-y-1.5">
                    {order.order_items.slice(0, 2).map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span className="text-brand-700 truncate">{item.product_title}</span>
                        <span className="text-brand-400 shrink-0 ml-3">{item.quantity}×</span>
                      </div>
                    ))}
                    {order.order_items.length > 2 && <p className="text-xs text-brand-400">+{order.order_items.length - 2} more</p>}
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t border-brand-50 p-5 space-y-5 animate-fade-in">
                    {/* Buyer info */}
                    {order.buyer && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-semibold text-brand-600">
                          {order.buyer.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-brand-800">{order.buyer.display_name}</p>
                          {order.buyer.username && <p className="text-xs text-brand-400">@{order.buyer.username}</p>}
                        </div>
                      </div>
                    )}

                    {/* Items */}
                    <div className="space-y-2">
                      {order.order_items.map((item) => (
                        <div key={item.id} className="flex items-center gap-3">
                          {item.product_image_url ? (
                            <img src={item.product_image_url} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-cream-100 flex items-center justify-center shrink-0">
                              <Package className="h-5 w-5 text-brand-300" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-brand-800 truncate">{item.product_title}</p>
                            <p className="text-xs text-brand-400">{item.quantity} × {formatCurrency(item.unit_price)}</p>
                          </div>
                          <span className="text-sm font-semibold text-brand-900">{formatCurrency(item.subtotal)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Payment & Delivery */}
                    <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-brand-50">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide">Payment</p>
                        {payment && (
                          <div className="flex items-center gap-2">
                            <PaymentIcon className="h-4 w-4 text-brand-600" />
                            <div>
                              <p className="text-sm text-brand-800">{getPaymentMethodLabel(payment.method ?? '')}</p>
                              <Badge variant={statusBadgeVariant(payment.status)}>{getPaymentStatusLabel(payment.status)}</Badge>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide">Delivery</p>
                        {delivery && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Truck className="h-4 w-4 text-brand-600" />
                              <Badge variant={statusBadgeVariant(delivery.status)}>{getDeliveryStatusLabel(delivery.status)}</Badge>
                            </div>
                            {delivery.courier && <p className="text-xs text-brand-600">Courier: {delivery.courier}</p>}
                            {delivery.tracking_number && <p className="text-xs text-brand-600">Tracking: {delivery.tracking_number}</p>}
                            {delivery.estimated_delivery && <p className="text-xs text-brand-600">ETA: {delivery.estimated_delivery}</p>}
                            {delivery.notes && <p className="text-xs text-brand-600">Notes: {delivery.notes}</p>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Shipping address */}
                    {order.shipping_address && (
                      <div className="pt-3 border-t border-brand-50">
                        <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide mb-1">Ship To</p>
                        <div className="flex items-start gap-2 text-sm text-brand-700">
                          <MapPin className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
                          <div>
                            <p>{order.shipping_contact_name}</p>
                            <p>{order.shipping_contact_phone}</p>
                            <p>{order.shipping_address}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Disputes */}
                    {order.disputes.length > 0 && (
                      <div className="pt-3 border-t border-brand-50">
                        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Disputes</p>
                        {order.disputes.map((d) => (
                          <div key={d.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-amber-800">{d.reason}</span>
                              <Badge variant={statusBadgeVariant(d.status)}>{getDisputeStatusLabel(d.status)}</Badge>
                            </div>
                            <p className="text-xs text-amber-700">{d.description}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Status history */}
                    {order.status_history.length > 0 && (
                      <div className="pt-3 border-t border-brand-50">
                        <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide mb-2">Status History</p>
                        <div className="space-y-1.5">
                          {order.status_history.map((h) => (
                            <div key={h.id} className="flex items-center gap-2 text-xs text-brand-600">
                              <Clock className="h-3 w-3 text-brand-400 shrink-0" />
                              <span>{formatDateTime(h.created_at)}</span>
                              <span className="text-brand-400">→</span>
                              <span className="font-medium text-brand-700">{getOrderStatusLabel(h.new_status)}</span>
                              <span className="text-brand-400 capitalize">({h.actor_role})</span>
                              {h.reason && <span className="text-brand-400 truncate">— {h.reason}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Totals */}
                    <div className="pt-3 border-t border-brand-50 space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-brand-500">Subtotal</span><span className="text-brand-800">{formatCurrency(order.subtotal)}</span></div>
                      <div className="flex justify-between"><span className="text-brand-500">Shipping</span><span className="text-brand-800">{formatCurrency(order.shipping_fee)}</span></div>
                      <div className="flex justify-between font-semibold text-base pt-1"><span className="text-brand-900">Total</span><span className="text-brand-900">{formatCurrency(order.total)}</span></div>
                    </div>

                    {/* Action buttons based on status */}
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-brand-50">
                      {canAccept && (
                        <>
                          <Button size="sm" onClick={() => handleTransition(order.id, 'confirmed')} loading={busyOrderId === order.id}>
                            <Check className="h-4 w-4" /> Accept Order
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => { setRejectOrder(order); setRejectReason(''); }} disabled={busyOrderId === order.id}>
                            <X className="h-4 w-4" /> Reject
                          </Button>
                        </>
                      )}
                      {canProcess && (
                        <Button size="sm" onClick={() => handleTransition(order.id, 'processing')} loading={busyOrderId === order.id}>
                          <Package className="h-4 w-4" /> Start Processing
                        </Button>
                      )}
                      {canReady && (
                        <Button size="sm" onClick={() => handleTransition(order.id, 'ready_for_pickup')} loading={busyOrderId === order.id}>
                          <Check className="h-4 w-4" /> Mark Ready
                        </Button>
                      )}
                      {canShip && (
                        <Button size="sm" onClick={() => handleTransition(order.id, 'shipped')} loading={busyOrderId === order.id}>
                          <Truck className="h-4 w-4" /> Mark Shipped
                        </Button>
                      )}
                      {canDeliver && (
                        <Button size="sm" onClick={() => handleTransition(order.id, 'delivered')} loading={busyOrderId === order.id}>
                          <Check className="h-4 w-4" /> Mark Delivered
                        </Button>
                      )}
                      {canComplete && (
                        <Button size="sm" onClick={() => handleTransition(order.id, 'completed')} loading={busyOrderId === order.id}>
                          <Check className="h-4 w-4" /> Complete Order
                        </Button>
                      )}
                      {delivery && ['confirmed', 'processing', 'ready_for_pickup', 'shipped', 'delivered'].includes(order.status) && (
                        <Button size="sm" variant="outline" onClick={() => {
                          setTrackingOrder(order);
                          setTrackingError(null);
                          setTrackingForm({
                            courier: delivery.courier ?? '',
                            tracking_number: delivery.tracking_number ?? '',
                            estimated_delivery: delivery.estimated_delivery ?? '',
                            notes: delivery.notes ?? '',
                          });
                        }} disabled={busyOrderId === order.id}>
                          <Pencil className="h-4 w-4" /> Update Tracking
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title={filter === 'all' ? 'No orders yet' : `No ${filter} orders`}
          description={filter === 'all' ? 'Orders from buyers will appear here once you start selling.' : 'Try a different filter.'}
          action={<Button onClick={() => navigate('/seller/dashboard')}>Go to Dashboard</Button>}
        />
      )}

      {/* Reject modal */}
      {rejectOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-brand-950/40 backdrop-blur-sm" onClick={() => setRejectOrder(null)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-6 animate-scale-in">
            <h2 className="text-lg font-semibold text-brand-900 mb-4">Reject Order</h2>
            <p className="text-sm text-brand-600 mb-4">
              Order <span className="font-semibold">{rejectOrder.order_number}</span> will be cancelled. The buyer will be notified.
            </p>
            <Textarea label="Reason for rejection" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Why are you rejecting this order?" />
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRejectOrder(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleReject} loading={busyOrderId === rejectOrder.id} disabled={!rejectReason.trim()}>Reject Order</Button>
            </div>
          </div>
        </div>
      )}
      {/* Tracking modal */}
      {trackingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-brand-950/40 backdrop-blur-sm" onClick={() => setTrackingOrder(null)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-6 animate-scale-in max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-brand-900 mb-1">Update Tracking Details</h2>
            <p className="text-sm text-brand-500 mb-4">Order {trackingOrder.order_number}</p>
            <form onSubmit={handleSaveTracking} className="space-y-4">
              <Input label="Courier" value={trackingForm.courier} onChange={(e) => setTrackingForm({ ...trackingForm, courier: e.target.value })} placeholder="e.g. J&T Express" maxLength={60} />
              <Input label="Tracking number" value={trackingForm.tracking_number} onChange={(e) => setTrackingForm({ ...trackingForm, tracking_number: e.target.value })} placeholder="e.g. JTS1234567890" maxLength={80} />
              <Input label="Estimated delivery" type="date" value={trackingForm.estimated_delivery} onChange={(e) => setTrackingForm({ ...trackingForm, estimated_delivery: e.target.value })} />
              <Textarea label="Notes" value={trackingForm.notes} onChange={(e) => setTrackingForm({ ...trackingForm, notes: e.target.value })} rows={2} placeholder="Optional delivery notes" maxLength={500} />
              {trackingError && <FormAlert tone="error">{trackingError}</FormAlert>}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setTrackingOrder(null)}>Cancel</Button>
                <Button type="submit" loading={busyOrderId === trackingOrder.id}>Save Tracking</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
