/**
 * Seller Sales Analytics page.
 *
 * Renders real sales data from Supabase via sellerAnalytics.ts. All figures
 * come from actual order_items, orders, and payments rows. When no sales
 * exist, an honest empty state is shown — no fabricated numbers or charts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, ShoppingCart, Package, DollarSign, Download, Calendar,
  ArrowLeft, BarChart3, MapPin, Users, Percent, AlertCircle, PackageX,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { formatCurrency, formatDate, getOrderStatusLabel } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  fetchSellerAnalytics, fetchComparison, resolveRange, previousRange,
  productsToCsv, summaryToCsv, downloadCsv, formatPesoShort,
  type AnalyticsFilters, type DateRangePreset, type AnalyticsResult, type ComparisonResult,
} from '@/lib/sellerAnalytics';

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'prev_month', label: 'Previous month' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'paid', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'partial'];

export function SellerAnalyticsPage() {
  const { user } = useAuth();
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [sellerName, setSellerName] = useState('');
  const [findingSeller, setFindingSeller] = useState(true);

  const [preset, setPreset] = useState<DateRangePreset>('last_30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [municipalityId, setMunicipalityId] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [municipalities, setMunicipalities] = useState<{ id: string; name: string }[]>([]);

  const [data, setData] = useState<AnalyticsResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load seller profile + filter options
  useEffect(() => {
    (async () => {
      if (!user) { setFindingSeller(false); return; }
      const { data: sp } = await supabase
        .from('seller_profiles')
        .select('id, shop_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!sp) { setFindingSeller(false); return; }
      setSellerId(sp.id as string);
      setSellerName(sp.shop_name as string);
      setFindingSeller(false);

      const [cats, muns] = await Promise.all([
        supabase.from('categories').select('id, name').eq('is_active', true).order('name'),
        supabase.from('municipalities').select('id, name').order('name'),
      ]);
      setCategories((cats.data ?? []) as { id: string; name: string }[]);
      setMunicipalities((muns.data ?? []) as { id: string; name: string }[]);
    })();
  }, [user]);

  const filters: AnalyticsFilters = useMemo(() => ({
    preset,
    customFrom: preset === 'custom' ? customFrom : undefined,
    customTo: preset === 'custom' ? customTo : undefined,
    categoryId: categoryId || undefined,
    municipalityId: municipalityId || undefined,
    orderStatus: orderStatus || undefined,
    paymentStatus: paymentStatus || undefined,
  }), [preset, customFrom, customTo, categoryId, municipalityId, orderStatus, paymentStatus]);

  const load = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    setError(null);
    try {
      const [analytics, comp] = await Promise.all([
        fetchSellerAnalytics(sellerId, filters),
        fetchComparison(sellerId, filters),
      ]);
      setData(analytics);
      setComparison(comp);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load analytics.');
      setData(null);
      setComparison(null);
    } finally {
      setLoading(false);
    }
  }, [sellerId, filters]);

  useEffect(() => { void load(); }, [load]);

  if (findingSeller) {
    return <div className="container-app py-12 animate-pulse"><div className="h-8 bg-cream-100 rounded w-1/3 mb-6" /><div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-cream-100 rounded-xl" />)}</div></div>;
  }

  if (!sellerId) {
    return (
      <div className="container-app py-12">
        <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="No seller profile found" description="Set up your storefront to access business analytics." action={<Button onClick={() => navigate('/seller/setup')}>Set Up Store</Button>} />
      </div>
    );
  }

  const range = resolveRange(filters);
  const periodLabel = preset === 'custom'
    ? `${formatDate(range.start)} – ${formatDate(range.end)}`
    : PRESETS.find((p) => p.value === preset)?.label ?? '';

  const hasData = !!data && data.summary.totalOrders > 0;

  const exportSummary = () => {
    if (!data) return;
    downloadCsv(`marimarket-sales-summary-${preset}.csv`, summaryToCsv(data.summary, periodLabel));
  };
  const exportProducts = () => {
    if (!data) return;
    downloadCsv(`marimarket-product-performance-${preset}.csv`, productsToCsv(data.products));
  };

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/seller/dashboard')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Business Analytics</h1>
          <p className="text-sm text-brand-500">{sellerName} · {periodLabel}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportSummary} disabled={!data}>
            <Download className="h-4 w-4" /> Summary CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportProducts} disabled={!data || data.products.length === 0}>
            <Download className="h-4 w-4" /> Products CSV
          </Button>
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{error}</div>}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-brand-100 p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-brand-500 mb-1"><Calendar className="inline h-3 w-3 mr-1" />Period</label>
            <select value={preset} onChange={(e) => setPreset(e.target.value as DateRangePreset)} className="h-9 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900">
              {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          {preset === 'custom' && (
            <>
              <div>
                <label className="block text-xs font-medium text-brand-500 mb-1">From</label>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-500 mb-1">To</label>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900" />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-medium text-brand-500 mb-1">Category</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-9 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900">
              <option value="">All</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-500 mb-1">Municipality</label>
            <select value={municipalityId} onChange={(e) => setMunicipalityId(e.target.value)} className="h-9 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900">
              <option value="">All</option>
              {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-500 mb-1">Order status</label>
            <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)} className="h-9 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900">
              <option value="">All</option>
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>{getOrderStatusLabel(s)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-500 mb-1">Payment</label>
            <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className="h-9 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900">
              <option value="">All</option>
              {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-cream-100 rounded-xl animate-pulse" />)}
        </div>
      ) : !hasData ? (
        <EmptyState
          icon={<BarChart3 className="h-8 w-8" />}
          title="No sales in this period"
          description="Analytics will appear here once orders are placed. Figures come from your real order and payment records — no sample data is shown."
          action={<Button variant="outline" onClick={() => navigate('/seller/dashboard')}>Go to Dashboard</Button>}
        />
      ) : data && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard icon={<ShoppingCart className="h-5 w-5" />} label="Total Orders" value={String(data.summary.totalOrders)} sub={`${data.summary.completedOrders} completed`} />
            <StatCard icon={<DollarSign className="h-5 w-5" />} label="Gross Sales" value={formatCurrency(data.summary.grossSales)} sub={`${data.summary.unitsSold} units sold`} />
            <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Net Sales" value={formatCurrency(data.summary.netSales)} sub="after refunds" />
            <StatCard icon={<DollarSign className="h-5 w-5" />} label="Confirmed Payments" value={formatCurrency(data.summary.confirmedPayments)} sub="verified only" />
            <StatCard icon={<Percent className="h-5 w-5" />} label="Avg Order Value" value={formatCurrency(data.summary.averageOrderValue)} sub={`from ${data.summary.totalOrders} orders`} />
            <StatCard icon={<Package className="h-5 w-5" />} label="Units Sold" value={String(data.summary.unitsSold)} sub={`${data.summary.cancelledOrders} cancelled`} />
          </div>

          {/* Revenue breakdown + order stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-brand-100 p-5">
              <h2 className="text-sm font-semibold text-brand-900 mb-4">Revenue Breakdown</h2>
              <div className="space-y-3">
                <BreakdownRow label="Gross sales" value={data.summary.grossSales} color="bg-brand-600" />
                <BreakdownRow label="Discounts" value={data.summary.discounts} color="bg-amber-400" />
                <BreakdownRow label="Refunds" value={data.summary.refunds} color="bg-red-400" />
                <div className="border-t border-brand-100 pt-3">
                  <BreakdownRow label="Net sales" value={data.summary.netSales} color="bg-emerald-500" bold />
                </div>
              </div>
              <p className="text-xs text-brand-400 mt-4">Net sales = gross − refunds. Pending payments are not counted as confirmed revenue.</p>
            </div>

            <div className="bg-white rounded-xl border border-brand-100 p-5">
              <h2 className="text-sm font-semibold text-brand-900 mb-4">Order Statistics</h2>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Completed" value={data.summary.completedOrders} rate={data.completionRate} tone="text-emerald-600" />
                <MiniStat label="Pending" value={data.summary.pendingOrders} rate={data.summary.pendingOrders / (data.summary.totalOrders || 1)} tone="text-blue-600" />
                <MiniStat label="Cancelled" value={data.summary.cancelledOrders} rate={data.cancellationRate} tone="text-red-600" />
                <MiniStat label="Refunded" value={data.summary.refundedOrders} rate={data.refundRate} tone="text-amber-600" />
              </div>
            </div>
          </div>

          {/* Daily sales chart */}
          {data.daily.length > 0 && (
            <div className="bg-white rounded-xl border border-brand-100 p-5">
              <h2 className="text-sm font-semibold text-brand-900 mb-4">Sales Over Time</h2>
              <BarChart points={data.daily} />
              <p className="text-xs text-brand-400 mt-3">Daily gross sales in PHP, grouped by Asia/Manila timezone.</p>
            </div>
          )}

          {/* Period comparison */}
          {comparison && <ComparisonPanel comp={comparison} />}

          {/* Customer analytics */}
          <div className="bg-white rounded-xl border border-brand-100 p-5">
            <h2 className="text-sm font-semibold text-brand-900 mb-4 flex items-center gap-1.5"><Users className="h-4 w-4 text-brand-500" /> Customer Activity</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStat label="New customers" value={data.newCustomers} tone="text-brand-700" />
              <MiniStat label="Returning" value={data.returningCustomers} tone="text-brand-700" />
              <MiniStat label="Completion rate" value={`${(data.completionRate * 100).toFixed(0)}%`} tone="text-emerald-600" />
              <MiniStat label="Cancellation rate" value={`${(data.cancellationRate * 100).toFixed(0)}%`} tone="text-red-600" />
            </div>
            <p className="text-xs text-brand-400 mt-3">Customer counts are aggregated — no private buyer information is exposed.</p>
          </div>

          {/* Product performance */}
          <div className="bg-white rounded-xl border border-brand-100 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-brand-50">
              <h2 className="text-sm font-semibold text-brand-900">Product Performance</h2>
              {data.products.length > 0 && <span className="text-xs text-brand-400">{data.products.length} product{data.products.length !== 1 ? 's' : ''}</span>}
            </div>
            {data.products.length === 0 ? (
              <div className="p-5"><EmptyState icon={<PackageX className="h-8 w-8" />} title="No product sales in this period" description="Products with recorded sales will appear here ranked by gross sales." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-cream-50 text-brand-500 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium">Product</th>
                      <th className="px-4 py-3 font-medium hidden sm:table-cell">Category</th>
                      <th className="px-4 py-3 font-medium text-right">Units</th>
                      <th className="px-4 py-3 font-medium text-right">Gross</th>
                      <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Stock</th>
                      <th className="px-4 py-3 font-medium hidden sm:table-cell">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-50">
                    {data.products.slice(0, 20).map((p) => (
                      <tr key={p.productId} className="hover:bg-cream-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" /> : <div className="h-8 w-8 rounded bg-cream-100 flex items-center justify-center"><Package className="h-4 w-4 text-brand-300" /></div>}
                            <button onClick={() => navigate(`/product/${p.productId}`)} className="font-medium text-brand-900 hover:text-brand-600 truncate text-left">{p.title}</button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-brand-600 hidden sm:table-cell">{p.categoryName ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-medium text-brand-900">{p.unitsSold}</td>
                        <td className="px-4 py-3 text-right font-semibold text-brand-900">{formatCurrency(p.grossSales)}</td>
                        <td className="px-4 py-3 text-right text-brand-600 hidden sm:table-cell">{p.currentStock}</td>
                        <td className="px-4 py-3 hidden sm:table-cell"><Badge variant="default">{p.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Municipality breakdown */}
          {data.municipalities.length > 0 && (
            <div className="bg-white rounded-xl border border-brand-100 overflow-hidden">
              <div className="p-5 border-b border-brand-50">
                <h2 className="text-sm font-semibold text-brand-900 flex items-center gap-1.5"><MapPin className="h-4 w-4 text-brand-500" /> Sales by Municipality</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-cream-50 text-brand-500 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium">Municipality</th>
                      <th className="px-4 py-3 font-medium text-right">Orders</th>
                      <th className="px-4 py-3 font-medium text-right">Units</th>
                      <th className="px-4 py-3 font-medium text-right">Gross Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-50">
                    {data.municipalities.map((m) => (
                      <tr key={m.municipalityId} className="hover:bg-cream-50/50">
                        <td className="px-4 py-3 font-medium text-brand-900">{m.name}</td>
                        <td className="px-4 py-3 text-right text-brand-600">{m.orderCount}</td>
                        <td className="px-4 py-3 text-right text-brand-600">{m.unitsSold}</td>
                        <td className="px-4 py-3 text-right font-semibold text-brand-900">{formatCurrency(m.grossSales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Insights */}
          {data.products.length > 0 && (
            <div className="bg-white rounded-xl border border-brand-100 p-5">
              <h2 className="text-sm font-semibold text-brand-900 mb-3 flex items-center gap-1.5"><AlertCircle className="h-4 w-4 text-brand-500" /> Insights</h2>
              <div className="space-y-2">
                <Insight text={`Your top product by gross sales is "${data.products[0].title}" with ${formatCurrency(data.products[0].grossSales)} in the selected period.`} />
                {data.summary.cancelledOrders > 0 && <Insight text={`${data.summary.cancelledOrders} order${data.summary.cancelledOrders !== 1 ? 's were' : ' was'} cancelled in this period.`} />}
                {comparison && comparison.salesPct !== null && comparison.salesPct > 0 && <Insight text={`Net sales increased ${(comparison.salesPct).toFixed(0)}% compared to the previous period.`} />}
                {comparison && comparison.salesPct !== null && comparison.salesPct < 0 && <Insight text={`Net sales decreased ${(Math.abs(comparison.salesPct)).toFixed(0)}% compared to the previous period.`} />}
                {comparison && comparison.salesPct === null && <Insight text="Percentage change could not be calculated because the previous period had no sales." />}
                {data.products.some((p) => p.currentStock === 0) && <Insight text={`${data.products.filter((p) => p.currentStock === 0).length} product(s) with sales are currently out of stock.`} />}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-brand-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</div>
        <span className="text-xs font-medium text-brand-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-brand-900">{value}</p>
      <p className="text-xs text-brand-400 mt-0.5">{sub}</p>
    </div>
  );
}

function MiniStat({ label, value, rate, tone }: { label: string; value: string | number; rate?: number; tone: string }) {
  return (
    <div className="bg-cream-50 rounded-lg p-3">
      <p className="text-xs font-medium text-brand-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
      {rate !== undefined && <p className="text-xs text-brand-400 mt-0.5">{(rate * 100).toFixed(0)}% of orders</p>}
    </div>
  );
}

function BreakdownRow({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-3 w-3 rounded-full ${color} shrink-0`} />
      <span className={`text-sm flex-1 ${bold ? 'font-semibold text-brand-900' : 'text-brand-600'}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-bold text-brand-900' : 'font-medium text-brand-700'}`}>{formatCurrency(value)}</span>
    </div>
  );
}

function BarChart({ points }: { points: { date: string; gross: number; orders: number }[] }) {
  const max = Math.max(...points.map((p) => p.gross), 1);
  return (
    <div>
      <div className="flex items-end gap-1 h-40 overflow-x-auto pb-2">
        {points.map((p) => (
          <div key={p.date} className="flex flex-col items-center gap-1 shrink-0 group relative" style={{ minWidth: 24 }}>
            <div className="text-[9px] text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-6 whitespace-nowrap bg-brand-900 text-white px-1.5 py-0.5 rounded">
              {formatPesoShort(p.gross)} · {p.orders} order{p.orders !== 1 ? 's' : ''}
            </div>
            <div className="w-full bg-brand-200 rounded-t group-hover:bg-brand-500 transition-colors" style={{ height: `${(p.gross / max) * 100}%`, minHeight: p.gross > 0 ? 4 : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-brand-400 mt-2">
        <span>{points[0]?.date ? formatDate(points[0].date) : ''}</span>
        <span>{points[points.length - 1]?.date ? formatDate(points[points.length - 1].date) : ''}</span>
      </div>
    </div>
  );
}

function ComparisonPanel({ comp }: { comp: ComparisonResult }) {
  const prevRange_ = resolveRange({ preset: 'custom', customFrom: previousRange(resolveRange({ preset: 'last_30' })).start.slice(0, 10), customTo: previousRange(resolveRange({ preset: 'last_30' })).end.slice(0, 10) });
  void prevRange_;
  return (
    <div className="bg-white rounded-xl border border-brand-100 p-5">
      <h2 className="text-sm font-semibold text-brand-900 mb-4 flex items-center gap-1.5"><Percent className="h-4 w-4 text-brand-500" /> Period Comparison</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <ComparisonCell label="Net Sales" current={comp.current.netSales} previous={comp.previous.netSales} delta={comp.salesDelta} pct={comp.salesPct} format="peso" />
        <ComparisonCell label="Orders" current={comp.current.totalOrders} previous={comp.previous.totalOrders} delta={comp.orderDelta} pct={comp.orderPct} format="int" />
        <ComparisonCell label="Units Sold" current={comp.current.unitsSold} previous={comp.previous.unitsSold} delta={comp.unitsDelta} pct={comp.unitsPct} format="int" />
        <ComparisonCell label="Avg Order Value" current={comp.current.averageOrderValue} previous={comp.previous.averageOrderValue} delta={comp.aovDelta} pct={comp.aovPct} format="peso" />
      </div>
      <p className="text-xs text-brand-400 mt-3">Compared against the immediately preceding period of equal length. A null percentage means the previous period had zero sales.</p>
    </div>
  );
}

function ComparisonCell({ label, current, previous, delta, pct, format }: { label: string; current: number; previous: number; delta: number; pct: number | null; format: 'peso' | 'int' }) {
  const fmt = (n: number) => format === 'peso' ? formatCurrency(n) : String(n);
  const up = delta > 0;
  const down = delta < 0;
  return (
    <div className="bg-cream-50 rounded-lg p-3">
      <p className="text-xs font-medium text-brand-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-brand-900">{fmt(current)}</p>
      <div className="flex items-center gap-1 mt-1">
        {pct === null ? (
          <span className="text-xs text-brand-400">no prior data</span>
        ) : (
          <span className={`text-xs font-medium ${up ? 'text-emerald-600' : down ? 'text-red-600' : 'text-brand-400'}`}>
            {up ? '↑' : down ? '↓' : '—'} {Math.abs(pct).toFixed(0)}%
          </span>
        )}
        <span className="text-xs text-brand-400">prev {fmt(previous)}</span>
      </div>
    </div>
  );
}

function Insight({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-brand-600">
      <div className="h-1.5 w-1.5 rounded-full bg-brand-400 mt-2 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
