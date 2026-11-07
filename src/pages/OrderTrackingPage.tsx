import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Copy, MapPin, Package, Store, Truck, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import type { Delivery, Order, OrderItem, OrderStatusHistory } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { OrderTimeline } from '@/components/tracking/OrderTimeline';
import { buildOrderTimeline, getFulfillmentMethod } from '@/lib/orderTracking';
import { type RealtimeState, subscribeToOrderTracking } from '@/lib/orderTrackingRealtime';
import { formatCurrency, formatDate, getOrderStatusLabel } from '@/lib/utils';

interface SellerInfo {
  id: string;
  shop_name: string;
  slug: string | null;
  contact_phone: string | null;
}

interface TrackedItem extends OrderItem {
  seller_profiles: SellerInfo | null;
}

interface TrackedOrder extends Order {
  order_items: TrackedItem[];
  deliveries: Delivery[];
  order_status_history: OrderStatusHistory[];
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not-found' }
  | { kind: 'ready'; order: TrackedOrder };

const CONNECTION_COPY: Record<RealtimeState, { label: string; tone: string }> = {
  connecting: { label: 'Connecting for live updates...', tone: 'text-brand-600' },
  live: { label: 'Live updates on', tone: 'text-green-700' },
  offline: { label: 'Live updates unavailable. Reconnecting...', tone: 'text-amber-700' },
};

function isTrackedOrder(value: unknown): value is TrackedOrder {
  if (!value || typeof value !== 'object') return false;
  const order = value as Partial<TrackedOrder>;
  return typeof order.id === 'string'
    && typeof order.status === 'string'
    && Array.isArray(order.order_items)
    && Array.isArray(order.deliveries)
    && Array.isArray(order.order_status_history);
}

export function OrderTrackingPage({ orderId }: { orderId: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [realtime, setRealtime] = useState<RealtimeState>('connecting');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, seller_profiles(id, shop_name, slug, contact_phone)), deliveries(*), order_status_history(*)')
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      setState((prev) => (prev.kind === 'ready' ? prev : { kind: 'error', message: 'We could not load this order. Please try again.' }));
      return;
    }
    if (!data) {
      setState({ kind: 'not-found' });
      return;
    }
    if (!isTrackedOrder(data)) {
      setState({ kind: 'error', message: 'This order returned unexpected information. Please refresh the page.' });
      return;
    }
    setState({ kind: 'ready', order: data });
  }, [orderId]);

  useEffect(() => {
    load();
    return subscribeToOrderTracking(orderId, load, setRealtime);
  }, [orderId, load]);

  if (state.kind === 'loading') {
    return (
      <div className="container-app py-12">
        <div className="rounded-xl border border-brand-100 bg-white p-10 text-center text-sm text-brand-500">
          Loading your order...
        </div>
      </div>
    );
  }

  if (state.kind === 'not-found') {
    return (
      <div className="container-app py-12">
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="Order not found"
          description="This order does not exist or is not linked to your account."
          action={<Button onClick={() => navigate('/orders')}>Back to my orders</Button>}
        />
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="container-app py-12">
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-red-700">{state.message}</p>
          <Button variant="outline" size="sm" onClick={load}>Try again</Button>
        </div>
      </div>
    );
  }

  const { order } = state;
  const method = getFulfillmentMethod(order.shipping_address);
  const timeline = buildOrderTimeline({
    status: order.status,
    method,
    createdAt: order.created_at,
    history: order.order_status_history,
  });
  const delivery = order.deliveries[0] ?? null;
  const sellers = Array.from(
    new Map(order.order_items.filter((i) => i.seller_profiles).map((i) => [i.seller_profiles!.id, i.seller_profiles!])).values(),
  );
  const connection = CONNECTION_COPY[realtime];
  const ConnectionIcon = realtime === 'offline' ? WifiOff : Wifi;

  const copyTracking = async () => {
    if (!delivery?.tracking_number) return;
    await navigator.clipboard.writeText(delivery.tracking_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="container-app animate-fade-in py-8">
      <button
        onClick={() => navigate('/orders')}
        className="mb-4 flex items-center gap-1 text-sm text-brand-600 transition-colors hover:text-brand-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to my orders
      </button>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Order tracking</p>
          <h1 className="text-2xl font-bold text-brand-900">{order.order_number}</h1>
          <p className="text-sm text-brand-600">Placed {formatDate(order.created_at)}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Badge variant="info">{getOrderStatusLabel(order.status)}</Badge>
          <p
            role="status"
            aria-live="polite"
            className={`flex items-center gap-1.5 text-xs font-medium ${connection.tone}`}
          >
            <ConnectionIcon className="h-3.5 w-3.5" aria-hidden="true" /> {connection.label}
          </p>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-6">
          <div className="rounded-xl border border-brand-100 bg-white p-5 sm:p-6">
            <h2 className="mb-5 text-base font-semibold text-brand-900">Progress</h2>
            <OrderTimeline timeline={timeline} />
          </div>

          <div className="rounded-xl border border-brand-100 bg-white p-5 sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-brand-900">Items</h2>
            <ul className="divide-y divide-brand-100">
              {order.order_items.map((item) => (
                <li key={item.id} className="flex items-center gap-4 py-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-brand-50">
                    {item.product_image_url && (
                      <img src={item.product_image_url} alt={item.product_title} className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand-900">{item.product_title}</p>
                    <p className="text-xs text-brand-500">
                      {item.quantity} x {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-brand-900">{formatCurrency(item.subtotal)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-brand-100 pt-3 text-sm font-semibold text-brand-900">
              <span>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-xl border border-brand-100 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-brand-900">
              {method === 'delivery' ? <Truck className="h-4 w-4" aria-hidden="true" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}
              {method === 'delivery' ? 'Delivery' : 'Pickup'}
            </h2>

            {method === 'delivery' ? (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-brand-500">Delivery address</dt>
                  <dd className="text-brand-900">{order.shipping_address}</dd>
                  {order.shipping_contact_name && (
                    <dd className="text-brand-700">{order.shipping_contact_name} {order.shipping_contact_phone}</dd>
                  )}
                </div>
                <div>
                  <dt className="text-xs text-brand-500">Courier</dt>
                  <dd className="text-brand-900">{delivery?.courier ?? 'Not added by the seller yet'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-brand-500">Tracking number</dt>
                  <dd className="flex items-center gap-2">
                    <span className="text-brand-900">{delivery?.tracking_number ?? 'Not added yet'}</span>
                    {delivery?.tracking_number && (
                      <Button variant="ghost" size="sm" onClick={copyTracking} aria-label="Copy tracking number">
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
                      </Button>
                    )}
                  </dd>
                </div>
                {delivery?.estimated_delivery && (
                  <div>
                    <dt className="text-xs text-brand-500">Estimated delivery</dt>
                    <dd className="text-brand-900">{formatDate(delivery.estimated_delivery)}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-brand-500">Pickup location</dt>
                  <dd className="text-brand-900">{delivery?.pickup_address ?? 'The seller has not published a pickup address. Contact the seller below.'}</dd>
                </div>
                {delivery?.notes && (
                  <div>
                    <dt className="text-xs text-brand-500">Pickup instructions</dt>
                    <dd className="whitespace-pre-line text-brand-900">{delivery.notes}</dd>
                  </div>
                )}
              </dl>
            )}

            {method === 'delivery' && delivery?.notes && (
              <div className="mt-4 border-t border-brand-100 pt-4 text-sm">
                <p className="text-xs text-brand-500">Fulfillment notes</p>
                <p className="whitespace-pre-line text-brand-900">{delivery.notes}</p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-brand-100 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-brand-900">
              <Store className="h-4 w-4" aria-hidden="true" /> Seller
            </h2>
            {sellers.length === 0 ? (
              <p className="text-sm text-brand-500">Seller details are not available.</p>
            ) : (
              <ul className="space-y-3">
                {sellers.map((seller) => (
                  <li key={seller.id} className="text-sm">
                    <p className="font-medium text-brand-900">{seller.shop_name}</p>
                    {seller.contact_phone && <p className="text-brand-600">{seller.contact_phone}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
