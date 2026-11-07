import type { OrderStatusHistory } from '@/types';

export type FulfillmentMethod = 'delivery' | 'pickup';

const DELIVERY_STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'] as const;
const PICKUP_STEPS = ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'delivered'] as const;
const EXCEPTION_STATUSES = ['cancelled', 'refunded', 'disputed'] as const;

export interface TimelineStep {
  status: string;
  reached: boolean;
  at: string | null;
  actorRole: string | null;
  note: string | null;
}

export interface TimelineEvent {
  status: string;
  at: string;
  actorRole: string | null;
  note: string | null;
}

export interface OrderTimeline {
  steps: TimelineStep[];
  exceptions: TimelineEvent[];
}

export function getFulfillmentMethod(shippingAddress: string | null): FulfillmentMethod {
  return shippingAddress ? 'delivery' : 'pickup';
}

export function getActorLabel(role: string | null): string {
  switch (role) {
    case 'buyer': return 'You';
    case 'seller': return 'Seller';
    case 'admin': return 'MariMarket admin';
    default: return 'System';
  }
}

export function getStepLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Order placed',
    confirmed: 'Confirmed',
    processing: 'Being prepared',
    ready_for_pickup: 'Ready for pickup',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
    disputed: 'Disputed',
  };
  return labels[status] ?? status;
}

export function buildOrderTimeline(input: {
  status: string;
  method: FulfillmentMethod;
  createdAt: string;
  history: OrderStatusHistory[];
}): OrderTimeline {
  const steps: readonly string[] = input.method === 'pickup' ? PICKUP_STEPS : DELIVERY_STEPS;
  const sorted = [...input.history].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const exceptions: TimelineEvent[] = sorted
    .filter((h) => EXCEPTION_STATUSES.includes(h.new_status as (typeof EXCEPTION_STATUSES)[number]))
    .map((h) => ({ status: h.new_status, at: h.created_at, actorRole: h.actor_role, note: h.reason }));

  const currentIndex = input.status === 'completed'
    ? steps.indexOf('delivered')
    : steps.indexOf(input.status);

  const timelineSteps: TimelineStep[] = steps.map((status, index) => {
    const matching = sorted.filter((h) => h.new_status === status);
    const latest = matching[matching.length - 1];
    const reached = index <= currentIndex;

    if (!reached) {
      return { status, reached: false, at: null, actorRole: null, note: null };
    }

    if (status === 'pending') {
      return { status, reached: true, at: input.createdAt, actorRole: 'buyer', note: null };
    }

    return {
      status,
      reached: true,
      at: latest?.created_at ?? null,
      actorRole: latest?.actor_role ?? null,
      note: latest?.reason ?? null,
    };
  });

  return { steps: timelineSteps, exceptions };
}
