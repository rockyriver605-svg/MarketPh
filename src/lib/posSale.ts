import type { Discount } from '@/lib/salesCalculator';

export interface SalePayloadItem {
  product_title: string;
  variant_label: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount_type: 'percent' | 'fixed' | null;
  discount_value: number | null;
  discount_amount: number;
}

export interface SalePayload {
  id: string;
  transaction_number: string;
  created_at: string;
  subtotal: number;
  discount_amount: number;
  discount_type: 'percent' | 'fixed' | null;
  discount_value: number | null;
  total_amount: number;
  amount_paid: number;
  change_due: number;
  payment_method: string;
  store: { name: string | null; phone: string | null; email: string | null };
  items: SalePayloadItem[];
}

export function toRpcDiscount(discount: Discount | null) {
  if (!discount) return null;
  return discount.type === 'percent'
    ? { type: 'percent', value: discount.percent }
    : { type: 'fixed', value: discount.centavos / 100 };
}

export function isSalePayload(value: unknown): value is SalePayload {
  if (!value || typeof value !== 'object') return false;
  const sale = value as Partial<SalePayload>;
  return typeof sale.transaction_number === 'string'
    && typeof sale.total_amount === 'number'
    && Array.isArray(sale.items);
}
