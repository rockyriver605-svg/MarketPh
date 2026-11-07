import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Package, ArrowLeft, Truck, Banknote, CreditCard, Smartphone, Wallet, MapPin,
  X, AlertTriangle, Clock, Store, ChevronDown, ChevronUp, Download, MessageSquare, RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { Order, OrderItem, Payment, Delivery, OrderStatusHistory, OrderDispute } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Textarea, Select } from '@/components/ui/Input';
import { FormAlert } from '@/components/auth/AuthLayout';
import { formatCurrency, formatDateTime, getOrderStatusLabel, getPaymentMethodLabel } from '@/lib/utils';
import { PurchaseFilterBar } from '@/components/orders/PurchaseFilterBar';
import {
  DEFAULT_PURCHASE_FILTERS, PURCHASE_SECTIONS, applyPurchaseFilters, getSectionCount,
  getDeliveryStatusLabel, getDisputeStatusLabel, getPaymentStatusLabel, statusBadgeVariant,
  type PurchaseFilters, type PurchaseRecord, type PurchaseSection,
} from '@/lib/purchaseHistory';
import { isVerifiedReceipt } from '@/lib/paymentRecords';
import { addPlanToCart, planReorder, type ReorderIssue } from '@/lib/reorder';

interface OrderWithDetails extends Order {
  order_items: OrderItem[];
  payments: Payment[];
  deliveries: Delivery[];
  status_history: OrderStatusHistory[];
  disputes: OrderDispute[];
  seller_profiles: { id: string; shop_name: string; slug: string | null }[];
}

interface ReorderResult {
  orderId: string;
  added: number;
  issues: ReorderIssue[];
}

function paymentIcon(method: string | null) {
  switch (method) {
    case 'cod': return Banknote;
    case 'gcash': return Smartphone;
    case 'maya': return Wallet;
    default: return CreditCard;
  }
}

const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'processing'];
const DISPUTE_REASONS = [
  'Item not received',
  'Item damaged or defective',
  'Wrong item delivered',
  'Seller unresponsive',
  'Payment issue',
  'Other problem',
];

export function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<PurchaseFilters>(DEFAULT_PURCHASE_FILTERS);
  const [municipalities, setMunicipalities] = useState<{ id: string; name: string }[]>([]);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [reorderResult, setReorderResult] = useState<ReorderResult | null>(null);
  const [cancelOrder, setCancelOrder] = useState<OrderWithDetails | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [disputeOrder, setDisputeOrder] = useState<OrderWithDetails | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeDesc, setDisputeDesc] = useState('');
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [actionError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!user) return;
    const { data: orderData } = await supabase
      .from('orders')
      .select('*')
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false });
    const ordersList = (orderData as Order[] | null) ?? [];
    if (ordersList.length === 0) {
      setOrders([]);
      setLoading(false);
      return;
    }
    const orderIds = ordersList.map((o) => o.id);
    const [itemsRes, paymentsRes, deliveriesRes, historyRes, disputesRes] = await Promise.all([
      supabase.from('order_items').select('*').in('order_id', orderIds),
      supabase.from('payments').select('*').in('order_id', orderIds),
      supabase.from('deliveries').select('*').in('order_id', orderIds),
      supabase.from('order_status_history').select('*').in('order_id', orderIds).order('created_at', { ascending: true }),
      supabase.from('order_disputes').select('*').in('order_id', orderIds).order('created_at', { ascending: false }),
    ]);

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

    // Gather unique seller IDs and fetch profiles
    const sellerIds = new Set<string>();
    Object.values(itemMap).forEach((items) => items.forEach((i) => sellerIds.add(i.seller_id)));
    const sellerIdArr = Array.from(sellerIds);
    const sellerMap: Record<string, { id: string; shop_name: string; slug: string | null }> = {};
    if (sellerIdArr.length > 0) {
      const { data: sellerData } = await supabase
        .from('seller_profiles')
        .select('id, shop_name, slug')
        .in('id', sellerIdArr);
      (sellerData as { id: string; shop_name: string; slug: string | null }[] | null)?.forEach((s) => {
        sellerMap[s.id] = s;
      });
    }

    setOrders(ordersList.map((o) => ({
      ...o,
      order_items: itemMap[o.id] ?? [],
      payments: payMap[o.id] ?? [],
      deliveries: delMap[o.id] ?? [],
      status_history: histMap[o.id] ?? [],
      disputes: dispMap[o.id] ?? [],
      seller_profiles: (itemMap[o.id] ?? []).map((i) => sellerMap[i.seller_id]).filter((s): s is { id: string; shop_name: string; slug: string | null } => !!s),
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    supabase.from('municipalities').select('id, name').order('name').then(({ data }) => {
      setMunicipalities((data as { id: string; name: string }[] | null) ?? []);
    });
  }, []);

  const records = useMemo<(OrderWithDetails & PurchaseRecord)[]>(() => orders.map((o) => ({
    ...o,
    sellerIds: Array.from(new Set(o.order_items.map((i) => i.seller_id))),
    sellerNames: o.seller_profiles.map((s) => s.shop_name),
  })), [orders]);
  const filteredRecords = useMemo(() => applyPurchaseFilters(records, filters), [records, filters]);
  const sectionCounts = useMemo(() => Object.fromEntries(
    PURCHASE_SECTIONS.map((s) => [s.value, getSectionCount(records, s.value)]),
  ) as Record<PurchaseSection, number>, [records]);
  const sellerOptions = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((o) => o.seller_profiles.forEach((s) => map.set(s.id, s.shop_name)));
    return Array.from(map, ([id, shop_name]) => ({ id, shop_name }));
  }, [orders]);

  const handleReorder = async (order: OrderWithDetails) => {
    if (!user) return;
    setReorderingId(order.id);
    setReorderResult(null);
    try {
      const plan = await planReorder(order.order_items);
      await addPlanToCart(user.id, plan);
      setReorderResult({ orderId: order.id, added: plan.eligible.length, issues: plan.issues });
    } catch (err) {
      setReorderResult({
        orderId: order.id,
        added: 0,
        issues: [{ title: order.order_number ?? 'Order', message: err instanceof Error ? err.message : 'Reorder failed.' }],
      });
    } finally {
      setReorderingId(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelOrder || !cancelReason.trim()) return;
    setCancelling(true);
    setCancelError(null);
    const { error: rpcErr } = await supabase.rpc('request_order_cancellation', {
      p_order_id: cancelOrder.id,
      p_reason: cancelReason.trim(),
    });
    setCancelling(false);
    if (rpcErr) {
      setCancelError(rpcErr.message.replace(/^ERROR:\s*/, ''));
      return;
    }
    setCancelOrder(null);
    setCancelReason('');
    await loadOrders();
  };

  const handleDispute = async () => {
    if (!disputeOrder || !disputeReason || !disputeDesc.trim()) return;
    setDisputing(true);
    setDisputeError(null);
    const { error: rpcErr } = await supabase.rpc('file_order_dispute', {
      p_order_id: disputeOrder.id,
      p_reason: disputeReason,
      p_description: disputeDesc.trim(),
    });
    setDisputing(false);
    if (rpcErr) {
      setDisputeError(rpcErr.message.replace(/^ERROR:\s*/, ''));
      return;
    }
    setDisputeOrder(null);
    setDisputeReason('');
    setDisputeDesc('');
    await loadOrders();
  };

  const handlePrintReceipt = (order: OrderWithDetails) => {
    const win = window.open('', '_blank', 'width=600,height=800');
    if (!win) return;
    const items = order.order_items.map((i) => `<tr><td>${i.product_title}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">₱${i.unit_price.toFixed(2)}</td><td style="text-align:right">₱${i.subtotal.toFixed(2)}</td></tr>`).join('');
    const verified = isVerifiedReceipt(order.payments[0] ?? null);
    const docTitle = verified ? 'MariMarket Receipt' : 'MariMarket Purchase Summary (not a payment receipt)';
    win.document.write(`<!DOCTYPE html><html><head><title>${docTitle} ${order.order_number}</title><style>body{font-family:system-ui,sans-serif;padding:2rem;color:#333}h1{font-size:1.5rem}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{padding:0.5rem;border-bottom:1px solid #ddd}th{text-align:left;background:#f5f5f5}.total{font-size:1.25rem;font-weight:bold;margin-top:1rem}</style></head><body>
    <h1>${docTitle}</h1>
    ${verified ? '' : '<p><em>No verified payment has been recorded for this order. Do not treat this as a paid receipt.</em></p>'}
    <p><strong>Order:</strong> ${order.order_number}<br><strong>Date:</strong> ${formatDateTime(order.created_at)}<br><strong>Status:</strong> ${getOrderStatusLabel(order.status)}</p>
    <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${items}</tbody></table>
    <p>Subtotal: ₱${order.subtotal.toFixed(2)}<br>Shipping: ₱${order.shipping_fee.toFixed(2)}</p>
    <p class="total">Total: ₱${order.total.toFixed(2)}</p>
    ${order.shipping_address ? `<p><strong>Delivery to:</strong><br>${order.shipping_contact_name ?? ''}<br>${order.shipping_contact_phone ?? ''}<br>${order.shipping_address}</p>` : ''}
    </body></html>`);
    win.document.close();
    win.print();
  };

  if (!user) {
    return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  }

  if (loading) {
    return <div className="container-app py-12 animate-pulse"><div className="h-8 bg-cream-100 rounded w-1/4" /></div>;
  }

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </button>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-brand-900">My Orders</h1>
      </div>

      {orders.length > 0 && (
        <PurchaseFilterBar
          filters={filters}
          onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
          sellers={sellerOptions}
          municipalities={municipalities}
          sectionCounts={sectionCounts}
        />
      )}

      {actionError && <div className="mb-4"><FormAlert tone="error">{actionError}</FormAlert></div>}

      {filteredRecords.length > 0 ? (
        <div className="space-y-4">
          {filteredRecords.map((order) => {
            const isExpanded = expandedId === order.id;
            const payment = order.payments[0];
            const delivery = order.deliveries[0];
            const PaymentIcon = paymentIcon(payment?.method ?? null);
            const itemsBySeller = order.order_items.reduce<Record<string, OrderItem[]>>((acc, item) => {
              if (!acc[item.seller_id]) acc[item.seller_id] = [];
              acc[item.seller_id].push(item);
              return acc;
            }, {});
            const sellerIds = Object.keys(itemsBySeller);
            const canCancel = CANCELLABLE_STATUSES.includes(order.status);
            const canDispute = !['cancelled', 'refunded', 'disputed', 'completed'].includes(order.status);
            const hasOpenDispute = order.disputes.some((d) => d.status === 'open' || d.status === 'under_review');

            return (
              <div key={order.id} className="bg-white rounded-xl border border-brand-100 overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full flex flex-wrap items-center justify-between gap-3 p-5 text-left hover:bg-brand-50/30 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-brand-900">{order.order_number}</p>
                    <p className="text-xs text-brand-400">{formatDateTime(order.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusBadgeVariant(order.status)}>{getOrderStatusLabel(order.status)}</Badge>
                    <span className="text-lg font-bold text-brand-800">{formatCurrency(order.total)}</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-brand-400" /> : <ChevronDown className="h-4 w-4 text-brand-400" />}
                  </div>
                </button>

                {!isExpanded && (
                  <div className="px-5 pb-4 space-y-1.5">
                    {order.order_items.slice(0, 2).map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span className="text-brand-700 truncate">{item.product_title}</span>
                        <span className="text-brand-400 shrink-0 ml-3">{item.quantity}× {formatCurrency(item.unit_price)}</span>
                      </div>
                    ))}
                    {order.order_items.length > 2 && <p className="text-xs text-brand-400">+{order.order_items.length - 2} more</p>}
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t border-brand-50 p-5 space-y-5 animate-fade-in">
                    {sellerIds.map((sid) => {
                      const seller = order.seller_profiles.find((s) => s.id === sid);
                      return (
                        <div key={sid}>
                          <div className="flex items-center gap-2 mb-2">
                            <Store className="h-4 w-4 text-brand-500" />
                            {seller ? (
                              <button onClick={() => seller.slug && navigate(`/seller/${seller.slug}`)}
                                className="text-sm font-semibold text-brand-700 hover:text-brand-600 transition-colors">
                                {seller.shop_name}
                              </button>
                            ) : <span className="text-sm font-semibold text-brand-500">Unknown Store</span>}
                          </div>
                          <div className="space-y-2">
                            {itemsBySeller[sid].map((item) => (
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
                        </div>
                      );
                    })}

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
                              {payment.reference_number && <p className="text-xs text-brand-500 mt-1">Reference: {payment.reference_number}</p>}
                              {payment.paid_at && <p className="text-xs text-brand-400">Paid {formatDateTime(payment.paid_at)}</p>}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide">Delivery</p>
                        {delivery && (
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-brand-600" />
                            <div>
                              <Badge variant={statusBadgeVariant(delivery.status)}>{getDeliveryStatusLabel(delivery.status)}</Badge>
                              {delivery.tracking_number && <p className="text-xs text-brand-500 mt-1">Tracking: {delivery.tracking_number}</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Shipping address */}
                    {order.shipping_address && (
                      <div className="pt-3 border-t border-brand-50">
                        <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide mb-1">Delivery Address</p>
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

                    {order.notes && (
                      <div className="pt-3 border-t border-brand-50">
                        <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide mb-1">Order Notes</p>
                        <p className="text-sm text-brand-700">{order.notes}</p>
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
                              {h.reason && <span className="text-brand-400 truncate">({h.reason})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Disputes */}
                    {order.disputes.length > 0 && (
                      <div className="pt-3 border-t border-brand-50">
                        <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide mb-2">Disputes</p>
                        {order.disputes.map((d) => (
                          <div key={d.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-amber-800">{d.reason}</span>
                              <Badge variant={statusBadgeVariant(d.status)}>{getDisputeStatusLabel(d.status)}</Badge>
                            </div>
                            <p className="text-xs text-amber-700">{d.description}</p>
                            {d.resolution && <p className="text-xs text-amber-600 mt-1">Resolution: {d.resolution}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Totals */}
                    <div className="pt-3 border-t border-brand-50 space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-brand-500">Subtotal</span><span className="text-brand-800">{formatCurrency(order.subtotal)}</span></div>
                      <div className="flex justify-between"><span className="text-brand-500">Shipping</span><span className="text-brand-800">{formatCurrency(order.shipping_fee)}</span></div>
                      <div className="flex justify-between font-semibold text-base pt-1"><span className="text-brand-900">Total</span><span className="text-brand-900">{formatCurrency(order.total)}</span></div>
                    </div>

                    {reorderResult?.orderId === order.id && (
                      <div className="space-y-2">
                        {reorderResult.added > 0 && (
                          <FormAlert tone="success">
                            {reorderResult.added} item(s) added to your cart. Review them before checkout.
                          </FormAlert>
                        )}
                        {reorderResult.issues.map((issue, idx) => (
                          <FormAlert key={idx} tone="error">{issue.title}: {issue.message}</FormAlert>
                        ))}
                        {reorderResult.added > 0 && (
                          <Button size="sm" onClick={() => navigate('/cart')}>View Cart</Button>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-brand-50">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/orders/${order.id}`)}>
                        <Package className="h-4 w-4" /> View Details
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/orders/${order.id}/track`)}>
                        <MapPin className="h-4 w-4" /> Track Order
                      </Button>
                      <Button size="sm" variant="outline" loading={reorderingId === order.id} disabled={reorderingId !== null} onClick={() => handleReorder(order)}>
                        <RotateCcw className="h-4 w-4" /> Reorder
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handlePrintReceipt(order)}>
                        <Download className="h-4 w-4" /> Receipt
                      </Button>
                      {canCancel && (
                        <Button size="sm" variant="outline" onClick={() => { setCancelOrder(order); setCancelReason(''); setCancelError(null); }}>
                          <X className="h-4 w-4" /> Cancel Order
                        </Button>
                      )}
                      {canDispute && !hasOpenDispute && (
                        <Button size="sm" variant="outline" onClick={() => { setDisputeOrder(order); setDisputeReason(''); setDisputeDesc(''); setDisputeError(null); }}>
                          <AlertTriangle className="h-4 w-4" /> Report Problem
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
          title={orders.length === 0 ? 'No purchases yet' : 'No matching purchases'}
          description={orders.length === 0 ? 'Your purchase history will appear here once you start buying.' : 'Try a different search, section, or filter.'}
          action={orders.length === 0
            ? <Button onClick={() => navigate('/browse')}>Browse Products</Button>
            : <Button variant="outline" onClick={() => setFilters(DEFAULT_PURCHASE_FILTERS)}>Clear filters</Button>}
        />
      )}

      {/* Cancel modal */}
      <Modal open={cancelOrder !== null} onClose={() => setCancelOrder(null)} title="Cancel Order" size="sm">
        <p className="text-sm text-brand-600 mb-4">
          Order <span className="font-semibold">{cancelOrder?.order_number}</span> will be cancelled and stock will be returned to sellers.
        </p>
        <Textarea label="Reason for cancellation" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} placeholder="Why are you cancelling this order?" />
        {cancelError && <div className="mt-3"><FormAlert tone="error">{cancelError}</FormAlert></div>}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setCancelOrder(null)} disabled={cancelling}>Keep Order</Button>
          <Button variant="danger" onClick={handleCancel} loading={cancelling} disabled={!cancelReason.trim()}>Cancel Order</Button>
        </div>
      </Modal>

      {/* Dispute modal */}
      <Modal open={disputeOrder !== null} onClose={() => setDisputeOrder(null)} title="Report a Problem" size="sm">
        <p className="text-sm text-brand-600 mb-4">
          Order <span className="font-semibold">{disputeOrder?.order_number}</span> will be marked as disputed. Sellers and admins will review your report.
        </p>
        <Select label="Issue type" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}>
          <option value="">Select a reason...</option>
          {DISPUTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
        <div className="mt-4">
          <Textarea label="Describe the problem" value={disputeDesc} onChange={(e) => setDisputeDesc(e.target.value)} rows={4} placeholder="Provide details about what went wrong..." />
        </div>
        {disputeError && <div className="mt-3"><FormAlert tone="error">{disputeError}</FormAlert></div>}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDisputeOrder(null)} disabled={disputing}>Close</Button>
          <Button variant="danger" onClick={handleDispute} loading={disputing} disabled={!disputeReason || !disputeDesc.trim()}>
            <MessageSquare className="h-4 w-4" /> Submit Report
          </Button>
        </div>
      </Modal>
    </div>
  );
}
