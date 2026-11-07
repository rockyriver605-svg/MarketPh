import type { Order, OrderItem, Payment } from '@/types';
import { getFulfillmentMethod, type FulfillmentMethod } from '@/lib/orderTracking';

export type PurchaseSection =
  | 'all'
  | 'to_confirm'
  | 'to_process'
  | 'to_receive'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'disputed';

export type PurchaseSort = 'newest' | 'oldest' | 'highest' | 'lowest';

export interface PurchaseSectionDef {
  value: PurchaseSection;
  label: string;
  statuses: string[] | null;
}

export const PURCHASE_SECTIONS: PurchaseSectionDef[] = [
  { value: 'all', label: 'All Purchases', statuses: null },
  { value: 'to_confirm', label: 'To Confirm', statuses: ['pending'] },
  { value: 'to_process', label: 'To Process', statuses: ['confirmed', 'processing', 'paid', 'ready_for_pickup'] },
  { value: 'to_receive', label: 'To Receive', statuses: ['shipped', 'delivered'] },
  { value: 'completed', label: 'Completed', statuses: ['completed'] },
  { value: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
  { value: 'refunded', label: 'Refunded', statuses: ['refunded'] },
  { value: 'disputed', label: 'Disputed', statuses: ['disputed'] },
];

export const PURCHASE_SORT_OPTIONS: { value: PurchaseSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'highest', label: 'Highest amount' },
  { value: 'lowest', label: 'Lowest amount' },
];

export interface PurchaseFilters {
  search: string;
  section: PurchaseSection;
  paymentStatus: string;
  sellerId: string;
  municipalityId: string;
  fulfillment: FulfillmentMethod | '';
  dateFrom: string;
  dateTo: string;
  minAmount: string;
  maxAmount: string;
  sort: PurchaseSort;
}

export const DEFAULT_PURCHASE_FILTERS: PurchaseFilters = {
  search: '',
  section: 'all',
  paymentStatus: '',
  sellerId: '',
  municipalityId: '',
  fulfillment: '',
  dateFrom: '',
  dateTo: '',
  minAmount: '',
  maxAmount: '',
  sort: 'newest',
};

export interface PurchaseRecord extends Order {
  order_items: OrderItem[];
  payments: Payment[];
  sellerIds: string[];
  sellerNames: string[];
}

export function statusBadgeVariant(status: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'completed': case 'delivered': case 'paid': return 'success';
    case 'pending': case 'confirmed': case 'processing': case 'ready_for_pickup':
    case 'shipped': case 'in_transit': case 'out_for_delivery': case 'partial': return 'info';
    case 'cancelled': case 'failed': case 'returned': return 'error';
    case 'refunded': case 'picked_up': case 'disputed': return 'warning';
    default: return 'default';
  }
}

export function getDeliveryStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending', picked_up: 'Picked Up', in_transit: 'In Transit',
    out_for_delivery: 'Out for Delivery', delivered: 'Delivered', failed: 'Failed', returned: 'Returned',
  };
  return labels[status] ?? status;
}

export function getPaymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending', paid: 'Paid', failed: 'Failed', refunded: 'Refunded', partial: 'Partial',
  };
  return labels[status] ?? status;
}

export function getDisputeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: 'Open', under_review: 'Under Review', resolved: 'Resolved', dismissed: 'Dismissed',
  };
  return labels[status] ?? status;
}

export function getSectionCount<T extends PurchaseRecord>(orders: T[], section: PurchaseSection): number {
  const def = PURCHASE_SECTIONS.find((s) => s.value === section);
  if (!def || !def.statuses) return orders.length;
  return orders.filter((o) => def.statuses!.includes(o.status)).length;
}

export function applyPurchaseFilters<T extends PurchaseRecord>(orders: T[], f: PurchaseFilters): T[] {
  const term = f.search.trim().toLowerCase();
  const min = f.minAmount === '' ? null : Number(f.minAmount);
  const max = f.maxAmount === '' ? null : Number(f.maxAmount);
  const from = f.dateFrom ? new Date(`${f.dateFrom}T00:00:00`).getTime() : null;
  const to = f.dateTo ? new Date(`${f.dateTo}T23:59:59.999`).getTime() : null;
  const section = PURCHASE_SECTIONS.find((s) => s.value === f.section);

  const result = orders.filter((o) => {
    if (section?.statuses && !section.statuses.includes(o.status)) return false;
    if (term) {
      const haystack = [
        o.order_number ?? '',
        o.payments.map((p) => p.reference_number ?? '').join(' '),
        o.order_items.map((i) => i.product_title).join(' '),
        o.sellerNames.join(' '),
      ].join(' ').toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    if (f.paymentStatus) {
      if (f.paymentStatus === 'none') {
        if (o.payments.length > 0) return false;
      } else if (!o.payments.some((p) => p.status === f.paymentStatus)) {
        return false;
      }
    }
    if (f.sellerId && !o.sellerIds.includes(f.sellerId)) return false;
    if (f.municipalityId && o.shipping_municipality_id !== f.municipalityId) return false;
    if (f.fulfillment && getFulfillmentMethod(o.shipping_address) !== f.fulfillment) return false;
    const created = new Date(o.created_at).getTime();
    if (from !== null && created < from) return false;
    if (to !== null && created > to) return false;
    if (min !== null && !Number.isNaN(min) && o.total < min) return false;
    if (max !== null && !Number.isNaN(max) && o.total > max) return false;
    return true;
  });

  return result.sort((a, b) => {
    switch (f.sort) {
      case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'highest': return b.total - a.total;
      case 'lowest': return a.total - b.total;
      default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });
}

export function hasNarrowingFilters(f: PurchaseFilters): boolean {
  return f.search.trim() !== '' || f.paymentStatus !== '' || f.sellerId !== '' || f.municipalityId !== ''
    || f.fulfillment !== '' || f.dateFrom !== '' || f.dateTo !== '' || f.minAmount !== '' || f.maxAmount !== '';
}
