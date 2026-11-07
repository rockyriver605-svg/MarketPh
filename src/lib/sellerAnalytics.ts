/**
 * Seller Sales Analytics — data-access layer.
 *
 * Every figure is derived from real Supabase rows: order_items (price
 * snapshots), orders (status, shipping location, buyer), and payments
 * (verified amounts). No fabricated numbers are ever produced.
 *
 * Metric definitions:
 *  - Gross sales: sum of order_item.subtotal for non-cancelled items.
 *  - Discounts: 0 by default (no discounts table on order_items); included
 *    in the shape so the engine can account for them when present.
 *  - Refunds: sum of payments.amount where status = 'refunded'.
 *  - Net sales: gross - refunds.
 *  - Units sold: sum of order_item.quantity for non-cancelled items.
 *  - Confirmed payments: sum of payments.amount where status = 'paid'.
 *  Orders with status 'cancelled' are excluded from gross/net sales.
 *  Pending payments are never counted as confirmed revenue.
 */

import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';

export type DateRangePreset =
  | 'today' | 'yesterday' | 'last_7' | 'last_30' | 'last_90'
  | 'this_month' | 'prev_month' | 'this_year' | 'custom';

export interface DateRange {
  start: string; // ISO start (inclusive)
  end: string;   // ISO end (inclusive)
}

export interface AnalyticsFilters {
  preset: DateRangePreset;
  customFrom?: string;
  customTo?: string;
  categoryId?: string;
  municipalityId?: string;
  orderStatus?: string;
  paymentStatus?: string;
}

export interface SalesSummary {
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  refundedOrders: number;
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
  confirmedPayments: number;
  unitsSold: number;
  averageOrderValue: number;
}

export interface DailyPoint {
  date: string;       // YYYY-MM-DD (Asia/Manila)
  gross: number;
  orders: number;
  units: number;
}

export interface ProductPerfRow {
  productId: string;
  title: string;
  imageUrl: string | null;
  sku: string | null;
  categoryName: string | null;
  unitsSold: number;
  grossSales: number;
  netSales: number;
  orderCount: number;
  currentStock: number;
  status: string;
}

export interface MunicipalityRow {
  municipalityId: string;
  name: string;
  orderCount: number;
  grossSales: number;
  unitsSold: number;
}

export interface ComparisonResult {
  current: SalesSummary;
  previous: SalesSummary;
  salesDelta: number;
  salesPct: number | null;
  orderDelta: number;
  orderPct: number | null;
  unitsDelta: number;
  unitsPct: number | null;
  aovDelta: number;
  aovPct: number | null;
}

export interface AnalyticsResult {
  summary: SalesSummary;
  daily: DailyPoint[];
  products: ProductPerfRow[];
  municipalities: MunicipalityRow[];
  newCustomers: number;
  returningCustomers: number;
  completionRate: number;
  cancellationRate: number;
  refundRate: number;
}

const CANCELLED = 'cancelled';

/** Returns [start, end] ISO strings in Asia/Manila for the given preset. */
export function resolveRange(f: AnalyticsFilters): DateRange {
  const now = new Date();
  const manilaOffset = 8 * 60; // Asia/Manila = UTC+8
  const local = new Date(now.getTime() + manilaOffset * 60000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();

  const startOfDay = (date: Date) => {
    const u = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
    return new Date(u.getTime() - manilaOffset * 60000).toISOString();
  };
  const endOfDay = (date: Date) => {
    const u = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
    return new Date(u.getTime() - manilaOffset * 60000).toISOString();
  };

  switch (f.preset) {
    case 'today':
      return { start: startOfDay(new Date(y, m, d)), end: endOfDay(new Date(y, m, d)) };
    case 'yesterday': {
      const yd = new Date(y, m, d - 1);
      return { start: startOfDay(yd), end: endOfDay(yd) };
    }
    case 'last_7': {
      const s = new Date(y, m, d - 6);
      return { start: startOfDay(s), end: endOfDay(new Date(y, m, d)) };
    }
    case 'last_30': {
      const s = new Date(y, m, d - 29);
      return { start: startOfDay(s), end: endOfDay(new Date(y, m, d)) };
    }
    case 'last_90': {
      const s = new Date(y, m, d - 89);
      return { start: startOfDay(s), end: endOfDay(new Date(y, m, d)) };
    }
    case 'this_month':
      return { start: startOfDay(new Date(y, m, 1)), end: endOfDay(new Date(y, m, d)) };
    case 'prev_month': {
      const pm = new Date(y, m - 1, 1);
      const pmEnd = new Date(y, m, 0);
      return { start: startOfDay(pm), end: endOfDay(pmEnd) };
    }
    case 'this_year':
      return { start: startOfDay(new Date(y, 0, 1)), end: endOfDay(new Date(y, m, d)) };
    case 'custom': {
      const cs = f.customFrom ? new Date(`${f.customFrom}T00:00:00+08:00`) : new Date(y, m, d);
      const ce = f.customTo ? new Date(`${f.customTo}T23:59:59+08:00`) : new Date(y, m, d);
      return { start: cs.toISOString(), end: ce.toISOString() };
    }
  }
}

/** Returns the immediately preceding range of the same length. */
export function previousRange(r: DateRange): DateRange {
  const startMs = new Date(r.start).getTime();
  const endMs = new Date(r.end).getTime();
  const span = endMs - startMs + 1;
  return { start: new Date(startMs - span).toISOString(), end: new Date(startMs - 1).toISOString() };
}

interface RawItemRow {
  id: string;
  product_id: string;
  seller_id: string;
  product_title: string;
  product_image_url: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
  created_at: string;
  order: {
    id: string;
    status: string;
    buyer_id: string;
    shipping_municipality_id: string | null;
    created_at: string;
  } | null;
  product: {
    sku: string | null;
    stock: number;
    status: string;
    category: { name: string } | null;
  } | null;
}

interface RawPaymentRow {
  order_id: string;
  amount: number;
  status: string;
}

/** Fetch order_items for a seller within a range, with joins. */
async function fetchItemRows(sellerId: string, r: DateRange, f: AnalyticsFilters): Promise<RawItemRow[]> {
  let q = supabase
    .from('order_items')
    .select(`
      id, product_id, seller_id, product_title, product_image_url,
      unit_price, quantity, subtotal, created_at,
      order:orders(id, status, buyer_id, shipping_municipality_id, created_at),
      product:products(sku, stock, status, category:categories(name))
    `)
    .eq('seller_id', sellerId)
    .gte('created_at', r.start)
    .lte('created_at', r.end);

  if (f.categoryId) q = q.eq('product.category_id', f.categoryId);
  if (f.municipalityId) q = q.eq('order.shipping_municipality_id', f.municipalityId);
  if (f.orderStatus) q = q.eq('order.status', f.orderStatus);

  const { data, error } = await q;
  if (error) throw new Error('Could not load sales data.');
  return (data ?? []) as unknown as RawItemRow[];
}

async function fetchPaymentRows(orderIds: string[], r: DateRange, f: AnalyticsFilters): Promise<RawPaymentRow[]> {
  if (orderIds.length === 0) return [];
  let q = supabase
    .from('payments')
    .select('order_id, amount, status, created_at')
    .in('order_id', orderIds)
    .gte('created_at', r.start)
    .lte('created_at', r.end);
  if (f.paymentStatus) q = q.eq('status', f.paymentStatus);
  const { data, error } = await q;
  if (error) throw new Error('Could not load payment data.');
  return (data ?? []) as RawPaymentRow[];
}

function computeSummary(items: RawItemRow[], payments: RawPaymentRow[]): SalesSummary {
  const active = items.filter((i) => i.order?.status !== CANCELLED);
  const gross = active.reduce((s, i) => s + Number(i.subtotal), 0);
  const units = active.reduce((s, i) => s + i.quantity, 0);

  const orderIds = new Set(active.map((i) => i.order?.id).filter(Boolean) as string[]);
  const allOrderIds = new Set(items.map((i) => i.order?.id).filter(Boolean) as string[]);

  const refunds = payments
    .filter((p) => p.status === 'refunded')
    .reduce((s, p) => s + Number(p.amount), 0);
  const confirmed = payments
    .filter((p) => p.status === 'paid')
    .reduce((s, p) => s + Number(p.amount), 0);

  const totalOrders = allOrderIds.size;
  const completed = [...allOrderIds].filter((oid) => items.some((i) => i.order?.id === oid && i.order?.status === 'completed')).length;
  const cancelled = [...allOrderIds].filter((oid) => items.some((i) => i.order?.id === oid && i.order?.status === CANCELLED)).length;
  const refunded = [...allOrderIds].filter((oid) => items.some((i) => i.order?.id === oid && i.order?.status === 'refunded')).length;
  const pending = totalOrders - completed - cancelled - refunded;

  const net = gross - refunds;
  const aov = orderIds.size > 0 ? gross / orderIds.size : 0;

  return {
    totalOrders,
    completedOrders: completed,
    pendingOrders: pending,
    cancelledOrders: cancelled,
    refundedOrders: refunded,
    grossSales: gross,
    discounts: 0,
    refunds,
    netSales: net,
    confirmedPayments: confirmed,
    unitsSold: units,
    averageOrderValue: aov,
  };
}

function toManilaDay(iso: string): string {
  const d = new Date(iso);
  const manila = new Date(d.getTime() + 8 * 60 * 60000);
  return manila.toISOString().slice(0, 10);
}

function buildDaily(items: RawItemRow[]): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const i of items) {
    if (i.order?.status === CANCELLED) continue;
    const day = toManilaDay(i.created_at);
    const p = map.get(day) ?? { date: day, gross: 0, orders: 0, units: 0 };
    p.gross += Number(i.subtotal);
    p.units += i.quantity;
    if (i.order?.id) {
      // count unique orders per day
      p.orders += 1; // approximate; dedupe below
    }
    map.set(day, p);
  }
  // dedupe order counts per day
  const orderDays = new Map<string, Set<string>>();
  for (const i of items) {
    if (i.order?.status === CANCELLED || !i.order?.id) continue;
    const day = toManilaDay(i.created_at);
    const set = orderDays.get(day) ?? new Set<string>();
    set.add(i.order.id);
    orderDays.set(day, set);
  }
  const days = Array.from(map.values());
  for (const d of days) d.orders = orderDays.get(d.date)?.size ?? 0;
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function buildProducts(items: RawItemRow[]): ProductPerfRow[] {
  const map = new Map<string, ProductPerfRow>();
  for (const i of items) {
    const pid = i.product_id;
    const row = map.get(pid) ?? {
      productId: pid,
      title: i.product_title,
      imageUrl: i.product_image_url,
      sku: i.product?.sku ?? null,
      categoryName: i.product?.category?.name ?? null,
      unitsSold: 0,
      grossSales: 0,
      netSales: 0,
      orderCount: 0,
      currentStock: i.product?.stock ?? 0,
      status: i.product?.status ?? 'unknown',
    };
    if (i.order?.status !== CANCELLED) {
      row.unitsSold += i.quantity;
      row.grossSales += Number(i.subtotal);
      row.orderCount += 1;
    }
    map.set(pid, row);
  }
  return Array.from(map.values()).sort((a, b) => b.grossSales - a.grossSales);
}

async function buildMunicipalities(items: RawItemRow[]): Promise<MunicipalityRow[]> {
  const orderMun = new Map<string, string | null>();
  for (const i of items) {
    if (i.order?.id && !orderMun.has(i.order.id)) {
      orderMun.set(i.order.id, i.order.shipping_municipality_id ?? null);
    }
  }
  const munIds = new Set<string>();
  for (const v of orderMun.values()) if (v) munIds.add(v);
  let names = new Map<string, string>();
  if (munIds.size > 0) {
    const { data } = await supabase.from('municipalities').select('id, name').in('id', [...munIds]);
    names = new Map((data ?? []).map((m: { id: string; name: string }) => [m.id, m.name]));
  }

  const map = new Map<string, MunicipalityRow>();
  const active = items.filter((i) => i.order?.status !== CANCELLED && i.order?.id);
  for (const i of active) {
    const mid = i.order!.shipping_municipality_id;
    if (!mid) continue;
    const row = map.get(mid) ?? { municipalityId: mid, name: names.get(mid) ?? 'Unknown', orderCount: 0, grossSales: 0, unitsSold: 0 };
    row.grossSales += Number(i.subtotal);
    row.unitsSold += i.quantity;
    map.set(mid, row);
  }
  // count unique orders per municipality
  const ordMun = new Map<string, Set<string>>();
  for (const i of active) {
    const mid = i.order!.shipping_municipality_id;
    if (!mid) continue;
    const set = ordMun.get(mid) ?? new Set<string>();
    set.add(i.order!.id);
    ordMun.set(mid, set);
  }
  for (const r of map.values()) r.orderCount = ordMun.get(r.municipalityId)?.size ?? 0;
  return Array.from(map.values()).sort((a, b) => b.grossSales - a.grossSales);
}

function buildCustomerCounts(items: RawItemRow[]): { newCustomers: number; returning: number } {
  const buyerOrderDates = new Map<string, string[]>();
  for (const i of items) {
    if (!i.order?.buyer_id) continue;
    const list = buyerOrderDates.get(i.order.buyer_id) ?? [];
    list.push(i.order.created_at);
    buyerOrderDates.set(i.order.buyer_id, list);
  }
  let newCount = 0;
  let returning = 0;
  for (const dates of buyerOrderDates.values()) {
    if (dates.length > 1) returning++;
    else newCount++;
  }
  return { newCustomers: newCount, returning };
}

export async function fetchSellerAnalytics(sellerId: string, f: AnalyticsFilters): Promise<AnalyticsResult> {
  const range = resolveRange(f);
  const items = await fetchItemRows(sellerId, range, f);
  const orderIds = [...new Set(items.map((i) => i.order?.id).filter(Boolean) as string[])];
  const payments = await fetchPaymentRows(orderIds, range, f);

  const summary = computeSummary(items, payments);
  const daily = buildDaily(items);
  const products = buildProducts(items);
  const municipalities = await buildMunicipalities(items);
  const { newCustomers, returning: returningCustomers } = buildCustomerCounts(items);

  const total = summary.totalOrders || 1;
  return {
    summary,
    daily,
    products,
    municipalities,
    newCustomers,
    returningCustomers,
    completionRate: summary.completedOrders / total,
    cancellationRate: summary.cancelledOrders / total,
    refundRate: summary.refundedOrders / total,
  };
}

export async function fetchComparison(sellerId: string, f: AnalyticsFilters): Promise<ComparisonResult> {
  const range = resolveRange(f);
  const prev = previousRange(range);
  const [cur, prevRes] = await Promise.all([
    fetchSellerAnalytics(sellerId, f),
    fetchSellerAnalytics(sellerId, { ...f, preset: 'custom', customFrom: prev.start.slice(0, 10), customTo: prev.end.slice(0, 10) }),
  ]);

  const pct = (c: number, p: number): number | null => {
    if (p === 0) return null;
    return ((c - p) / p) * 100;
  };

  return {
    current: cur.summary,
    previous: prevRes.summary,
    salesDelta: cur.summary.netSales - prevRes.summary.netSales,
    salesPct: pct(cur.summary.netSales, prevRes.summary.netSales),
    orderDelta: cur.summary.totalOrders - prevRes.summary.totalOrders,
    orderPct: pct(cur.summary.totalOrders, prevRes.summary.totalOrders),
    unitsDelta: cur.summary.unitsSold - prevRes.summary.unitsSold,
    unitsPct: pct(cur.summary.unitsSold, prevRes.summary.unitsSold),
    aovDelta: cur.summary.averageOrderValue - prevRes.summary.averageOrderValue,
    aovPct: pct(cur.summary.averageOrderValue, prevRes.summary.averageOrderValue),
  };
}

/** CSV export of the product performance table. */
export function productsToCsv(rows: ProductPerfRow[]): string {
  const header = ['Product', 'SKU', 'Category', 'Units Sold', 'Gross Sales (PHP)', 'Net Sales (PHP)', 'Orders', 'Current Stock', 'Status'];
  const lines = rows.map((r) => [
    escapeCsv(r.title),
    escapeCsv(r.sku ?? ''),
    escapeCsv(r.categoryName ?? ''),
    String(r.unitsSold),
    r.grossSales.toFixed(2),
    r.netSales.toFixed(2),
    String(r.orderCount),
    String(r.currentStock),
    r.status,
  ].join(','));
  return [header.join(','), ...lines].join('\n');
}

/** CSV export of the sales summary. */
export function summaryToCsv(s: SalesSummary, period: string): string {
  const rows: string[] = [
    ['Metric', 'Value (PHP unless noted)'].join(','),
    ['Reporting period', escapeCsv(period)].join(','),
    ['Total orders', String(s.totalOrders)].join(','),
    ['Completed orders', String(s.completedOrders)].join(','),
    ['Pending orders', String(s.pendingOrders)].join(','),
    ['Cancelled orders', String(s.cancelledOrders)].join(','),
    ['Refunded orders', String(s.refundedOrders)].join(','),
    ['Gross sales', s.grossSales.toFixed(2)].join(','),
    ['Discounts', s.discounts.toFixed(2)].join(','),
    ['Refunds', s.refunds.toFixed(2)].join(','),
    ['Net sales', s.netSales.toFixed(2)].join(','),
    ['Confirmed payments', s.confirmedPayments.toFixed(2)].join(','),
    ['Units sold', String(s.unitsSold)].join(','),
    ['Average order value', s.averageOrderValue.toFixed(2)].join(','),
  ];
  return rows.join('\n');
}

function escapeCsv(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatPesoShort(n: number): string {
  if (Math.abs(n) >= 1000000) return `₱${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `₱${(n / 1000).toFixed(1)}k`;
  return formatCurrency(n);
}
