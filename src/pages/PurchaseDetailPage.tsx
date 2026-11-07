import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Package, Store, MapPin, Truck, Clock, RotateCcw, Printer, Star, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { Order, OrderItem, Payment, Delivery, OrderStatusHistory, OrderDispute } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormAlert } from '@/components/auth/AuthLayout';
import { RefundSummary } from '@/components/orders/RefundSummary';
import { Modal } from '@/components/ui/Modal';
import { ReviewForm } from '@/components/reviews/ReviewForm';
import { submitReview, uploadReviewImage } from '@/lib/reviews';
import { formatCurrency, formatDateTime, getOrderStatusLabel, getPaymentMethodLabel } from '@/lib/utils';
import { getActorLabel, getFulfillmentMethod } from '@/lib/orderTracking';
import {
  getDeliveryStatusLabel, getDisputeStatusLabel, getPaymentStatusLabel, statusBadgeVariant,
} from '@/lib/purchaseHistory';
import { getTransactionState, isVerifiedReceipt } from '@/lib/paymentRecords';
import { addPlanToCart, planReorder, type ReorderIssue } from '@/lib/reorder';

interface SellerInfo {
  id: string;
  shop_name: string;
  slug: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  municipality_id: string | null;
}

interface PurchaseDetail {
  order: Order;
  items: OrderItem[];
  payments: Payment[];
  deliveries: Delivery[];
  history: OrderStatusHistory[];
  disputes: OrderDispute[];
  sellers: SellerInfo[];
  municipalities: Record<string, string>;
}

interface ReorderResult {
  added: number;
  issues: ReorderIssue[];
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-brand-100 p-5 space-y-4">
      <h2 className="text-xs font-semibold text-brand-500 uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 text-sm ${strong ? 'font-semibold text-base pt-2 border-t border-brand-50' : ''}`}>
      <span className="text-brand-500">{label}</span>
      <span className="text-brand-900 text-right">{value}</span>
    </div>
  );
}

export function PurchaseDetailPage({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [reorderResult, setReorderResult] = useState<ReorderResult | null>(null);
  const [reviewItem, setReviewItem] = useState<OrderItem | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);
  const [reviewedItems, setReviewedItems] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    const [orderRes, itemsRes, paymentsRes, deliveriesRes, historyRes, disputesRes] = await Promise.all([
      supabase.from('orders').select('*').eq('id', orderId).maybeSingle(),
      supabase.from('order_items').select('*').eq('order_id', orderId),
      supabase.from('payments').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
      supabase.from('deliveries').select('*').eq('order_id', orderId),
      supabase.from('order_status_history').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
      supabase.from('order_disputes').select('*').eq('order_id', orderId).order('created_at', { ascending: false }),
    ]);
    if (orderRes.error || itemsRes.error || paymentsRes.error || deliveriesRes.error || historyRes.error || disputesRes.error) {
      setLoadError('We could not load this purchase. Please try again.');
      setLoading(false);
      return;
    }
    const order = orderRes.data as Order | null;
    if (!order) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const items = (itemsRes.data as OrderItem[] | null) ?? [];
    const sellerIds = Array.from(new Set(items.map((i) => i.seller_id)));
    const sellersRes = sellerIds.length > 0
      ? await supabase.from('seller_profiles').select('id, shop_name, slug, contact_phone, contact_email, municipality_id').in('id', sellerIds)
      : { data: [] as SellerInfo[], error: null };
    if (sellersRes.error) {
      setLoadError('We could not load the seller details. Please try again.');
      setLoading(false);
      return;
    }
    const sellers = (sellersRes.data as SellerInfo[] | null) ?? [];

    const municipalityIds = Array.from(new Set(
      [order.shipping_municipality_id, ...sellers.map((s) => s.municipality_id)].filter((m): m is string => !!m),
    ));
    const munRes = municipalityIds.length > 0
      ? await supabase.from('municipalities').select('id, name').in('id', municipalityIds)
      : { data: [] as { id: string; name: string }[], error: null };
    if (munRes.error) {
      setLoadError('We could not load the location details. Please try again.');
      setLoading(false);
      return;
    }
    const municipalities = Object.fromEntries(
      ((munRes.data as { id: string; name: string }[] | null) ?? []).map((m) => [m.id, m.name]),
    );

    setDetail({
      order,
      items,
      payments: (paymentsRes.data as Payment[] | null) ?? [],
      deliveries: (deliveriesRes.data as Delivery[] | null) ?? [],
      history: (historyRes.data as OrderStatusHistory[] | null) ?? [],
      disputes: (disputesRes.data as OrderDispute[] | null) ?? [],
      sellers,
      municipalities,
    });
    setLoading(false);

    // Check which items already have reviews
    if (items.length > 0) {
      const itemIds = items.map((i) => i.id);
      const { data: existingReviews } = await supabase
        .from('reviews')
        .select('order_item_id')
        .in('order_item_id', itemIds);
      if (existingReviews) {
        setReviewedItems(new Set(existingReviews.map((r) => r.order_item_id)));
      }
    }
  }, [orderId, user]);

  useEffect(() => { load(); }, [load]);

  const handleReorder = async () => {
    if (!user || !detail) return;
    setReordering(true);
    setReorderResult(null);
    try {
      const plan = await planReorder(detail.items);
      await addPlanToCart(user.id, plan);
      setReorderResult({ added: plan.eligible.length, issues: plan.issues });
    } catch (err) {
      setReorderResult({ added: 0, issues: [{ title: detail.order.order_number, message: err instanceof Error ? err.message : 'Reorder failed.' }] });
    } finally {
      setReordering(false);
    }
  };

  if (!user) {
    return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  }

  if (loading) {
    return <div className="container-app py-12 animate-pulse space-y-4"><div className="h-8 bg-cream-100 rounded w-1/3" /><div className="h-40 bg-cream-100 rounded-xl" /></div>;
  }

  if (notFound || !detail) {
    return (
      <div className="container-app py-8">
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title={notFound ? 'Purchase not found' : 'Something went wrong'}
          description={notFound ? 'This purchase does not exist or is not linked to your account.' : loadError ?? ''}
          action={<Button onClick={() => navigate('/orders')}>Back to my orders</Button>}
        />
      </div>
    );
  }

  const { order, items, payments, deliveries, history, disputes, sellers, municipalities } = detail;
  const payment = payments[payments.length - 1] ?? null;
  const delivery = deliveries[0] ?? null;
  const transaction = getTransactionState(payment);
  const fulfillment = getFulfillmentMethod(order.shipping_address);
  const verified = isVerifiedReceipt(payment);
  const canReorder = items.length > 0;
  const cancellation = [...history].reverse().find((h) => h.new_status === 'cancelled') ?? null;
  const canReview = order.status === 'completed' || order.status === 'delivered';

  const sellerForItem = (item: OrderItem) => sellers.find((s) => s.id === item.seller_id);

  const handleReviewSubmit = async (rating: number, title: string, body: string, photos: File[]) => {
    if (!reviewItem) return;
    setReviewBusy(true);
    setReviewError(null);
    try {
      const reviewId = await submitReview(reviewItem.id, rating, title, body);
      for (let i = 0; i < photos.length; i++) {
        await uploadReviewImage(reviewId, photos[i], i);
      }
      setReviewedItems((prev) => new Set(prev).add(reviewItem.id));
      setReviewSuccess('Your review has been submitted successfully!');
      setReviewItem(null);
      setTimeout(() => setReviewSuccess(null), 4000);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Could not submit your review.');
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <div className="container-app py-8 animate-fade-in max-w-4xl">
      <button onClick={() => navigate('/orders')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors print:hidden">
        <ArrowLeft className="h-4 w-4" /> Back to my orders
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs text-brand-400 uppercase tracking-wide">Order</p>
          <h1 className="text-2xl font-bold text-brand-900">{order.order_number}</h1>
          <p className="text-sm text-brand-500 mt-1">Placed {formatDateTime(order.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Badge variant={statusBadgeVariant(order.status)}>{getOrderStatusLabel(order.status)}</Badge>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Save as PDF
          </Button>
        </div>
      </div>

      {reviewSuccess && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> {reviewSuccess}
        </div>
      )}

      <div className="grid gap-5">
        <SectionCard title="Order Information">
          <div className="space-y-2">
            <Row label="Order number" value={order.order_number} />
            <Row label="Created" value={formatDateTime(order.created_at)} />
            <Row label="Last status update" value={formatDateTime(order.updated_at)} />
            <Row label="Current status" value={getOrderStatusLabel(order.status)} />
            {order.notes && <Row label="Order notes" value={order.notes} />}
          </div>
          {cancellation && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 space-y-1">
              <p className="font-medium">This order was cancelled</p>
              <p>Reason: {cancellation.reason ?? 'No reason was recorded.'}</p>
              <p>Cancelled by: {getActorLabel(cancellation.actor_role)}</p>
              <p>Date: {formatDateTime(cancellation.created_at)}</p>
            </div>
          )}
          <RefundSummary orderStatus={order.status} payment={payment} history={history} />
        </SectionCard>

        <SectionCard title="Purchased Products">
          <div className="divide-y divide-brand-50">
            {items.map((item) => {
              const alreadyReviewed = reviewedItems.has(item.id);
              return (
                <div key={item.id} className="flex items-center gap-4 py-3">
                  {item.product_image_url ? (
                    <img src={item.product_image_url} alt="" className="h-16 w-16 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-cream-100 flex items-center justify-center shrink-0">
                      <Package className="h-6 w-6 text-brand-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-brand-900 truncate">{item.product_title}</p>
                    <p className="text-xs text-brand-500">Qty {item.quantity} x {formatCurrency(item.unit_price)} at purchase</p>
                    {canReview && alreadyReviewed && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 mt-1"><CheckCircle2 className="h-3 w-3" /> Reviewed</span>
                    )}
                    {canReview && !alreadyReviewed && (
                      <button
                        onClick={() => { setReviewError(null); setReviewItem(item); }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800 mt-1"
                      >
                        <Star className="h-3 w-3" /> Write a review
                      </button>
                    )}
                  </div>
                  <span className="font-semibold text-brand-900">{formatCurrency(item.subtotal)}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Sellers">
          <div className="space-y-3">
            {sellers.map((seller) => (
              <div key={seller.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-brand-500" />
                  <button
                    onClick={() => seller.slug && navigate(`/seller/${seller.slug}`)}
                    className="font-semibold text-brand-700 hover:text-brand-600 transition-colors"
                  >
                    {seller.shop_name}
                  </button>
                  {seller.municipality_id && municipalities[seller.municipality_id] && (
                    <span className="text-xs text-brand-500">{municipalities[seller.municipality_id]}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-brand-600">
                  {seller.contact_phone && <a href={`tel:${seller.contact_phone}`} className="hover:text-brand-800 underline-offset-2 hover:underline">{seller.contact_phone}</a>}
                  {seller.contact_email && <a href={`mailto:${seller.contact_email}`} className="hover:text-brand-800 underline-offset-2 hover:underline">{seller.contact_email}</a>}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Financial Breakdown">
          <div className="space-y-2">
            <Row label="Product subtotal" value={formatCurrency(order.subtotal)} />
            <Row label="Delivery fee" value={formatCurrency(order.shipping_fee)} />
            <Row label="Order total" value={formatCurrency(order.total)} strong />
          </div>
        </SectionCard>

        <SectionCard title="Transaction Record">
          {payment ? (
            <div className="space-y-2">
              <Row label="Payment method" value={getPaymentMethodLabel(payment.method ?? '')} />
              <Row label="Amount" value={`${formatCurrency(payment.amount)} (PHP)`} />
              <Row label="Reference" value={payment.reference_number ?? 'Not available'} />
              <Row label="Payment status" value={getPaymentStatusLabel(payment.status)} />
              {payment.paid_at && <Row label="Paid on" value={formatDateTime(payment.paid_at)} />}
              <Row label="Recorded" value={formatDateTime(payment.created_at)} />
            </div>
          ) : (
            <p className="text-sm text-brand-500">No payment record exists for this order yet.</p>
          )}
          <div className="rounded-lg bg-cream-50 border border-brand-100 p-3">
            <Badge variant={transaction.tone}>{transaction.label}</Badge>
            <p className="text-sm text-brand-600 mt-2">{transaction.description}</p>
          </div>
          <p className="text-xs text-brand-500">
            {verified
              ? 'This payment has been verified and can be printed as a receipt.'
              : 'This is not a payment receipt. It has not been verified as paid.'}
          </p>
        </SectionCard>

        <SectionCard title="Fulfillment">
          <div className="flex items-start gap-3 text-sm text-brand-700">
            {fulfillment === 'delivery' ? <Truck className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" /> : <MapPin className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" />}
            <div className="space-y-1">
              <p className="font-medium text-brand-900">{fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</p>
              {fulfillment === 'delivery' && order.shipping_address && (
                <>
                  <p>{order.shipping_contact_name}</p>
                  <p>{order.shipping_contact_phone}</p>
                  <p>{order.shipping_address}</p>
                  {order.shipping_municipality_id && municipalities[order.shipping_municipality_id] && <p>{municipalities[order.shipping_municipality_id]}</p>}
                </>
              )}
              {fulfillment === 'pickup' && <p>{delivery?.pickup_address ?? 'Pickup location will be confirmed by the seller.'}</p>}
            </div>
          </div>
          {delivery && (
            <div className="space-y-1 text-sm">
              <Row label="Delivery status" value={<Badge variant={statusBadgeVariant(delivery.status)}>{getDeliveryStatusLabel(delivery.status)}</Badge>} />
              {delivery.courier && <Row label="Courier" value={delivery.courier} />}
              {delivery.tracking_number && <Row label="Tracking number" value={delivery.tracking_number} />}
              {delivery.delivered_at && <Row label="Delivered on" value={formatDateTime(delivery.delivered_at)} />}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate(`/orders/${order.id}/track`)}>Track order</Button>
          </div>
        </SectionCard>

        <SectionCard title="Status History">
          {history.length === 0 ? (
            <p className="text-sm text-brand-500">No status changes have been recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3 text-sm">
                  <Clock className="h-4 w-4 text-brand-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-brand-900">{getOrderStatusLabel(h.new_status)}</p>
                    <p className="text-xs text-brand-500">{formatDateTime(h.created_at)} by {getActorLabel(h.actor_role)}</p>
                    {h.reason && <p className="text-xs text-brand-600 mt-0.5">{h.reason}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>

        {disputes.length > 0 && (
          <SectionCard title="Disputes">
            {disputes.map((d) => (
              <div key={d.id} className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-amber-800">{d.reason}</span>
                  <Badge variant={statusBadgeVariant(d.status)}>{getDisputeStatusLabel(d.status)}</Badge>
                </div>
                <p className="text-xs text-amber-700">{d.description}</p>
                {d.resolution && <p className="text-xs text-amber-700">Resolution: {d.resolution}</p>}
              </div>
            ))}
          </SectionCard>
        )}

        {canReorder && (
          <SectionCard title="Reorder">
            <p className="text-sm text-brand-600">Items are checked against current listings, stock, and prices before they are added to your cart.</p>
            <Button size="sm" loading={reordering} disabled={reordering} onClick={handleReorder}>
              <RotateCcw className="h-4 w-4" /> Reorder these items
            </Button>
            {reorderResult && (
              <div className="space-y-2">
                {reorderResult.added > 0 && (
                  <FormAlert tone="success">{reorderResult.added} item(s) added to your cart. Review them before checkout.</FormAlert>
                )}
                {reorderResult.issues.map((issue, idx) => (
                  <FormAlert key={idx} tone="error">{issue.title}: {issue.message}</FormAlert>
                ))}
                {reorderResult.added > 0 && <Button size="sm" onClick={() => navigate('/cart')}>View Cart</Button>}
              </div>
            )}
          </SectionCard>
        )}
      </div>

      {reviewItem && (
        <Modal
          open={!!reviewItem}
          onClose={() => { if (!reviewBusy) setReviewItem(null); }}
          title="Write a Review"
          size="md"
        >
          <ReviewForm
            productTitle={reviewItem.product_title}
            productImage={reviewItem.product_image_url}
            shopName={sellerForItem(reviewItem)?.shop_name ?? null}
            submitLabel="Submit Review"
            busy={reviewBusy}
            error={reviewError}
            onSubmit={handleReviewSubmit}
            onCancel={() => setReviewItem(null)}
          />
        </Modal>
      )}
    </div>
  );
}
