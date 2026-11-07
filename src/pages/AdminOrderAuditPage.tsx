import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import type { OrderStatusHistory } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormAlert } from '@/components/auth/AuthLayout';
import { formatDateTime, getOrderStatusLabel } from '@/lib/utils';
import { getActorLabel } from '@/lib/orderTracking';
import { statusBadgeVariant } from '@/lib/purchaseHistory';

const PAGE_SIZE = 100;

interface AuditEntry extends OrderStatusHistory {
  order_number: string;
}

export function AdminOrderAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const historyRes = await supabase
      .from('order_status_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (historyRes.error) {
      setError('The audit trail could not be loaded. Please try again.');
      setLoading(false);
      return;
    }
    const history = (historyRes.data as OrderStatusHistory[] | null) ?? [];
    const orderIds = Array.from(new Set(history.map((h) => h.order_id)));
    const ordersRes = orderIds.length > 0
      ? await supabase.from('orders').select('id, order_number').in('id', orderIds)
      : { data: [] as { id: string; order_number: string }[], error: null };
    if (ordersRes.error) {
      setError('The order numbers could not be loaded. Please try again.');
      setLoading(false);
      return;
    }
    const numbers = new Map(((ordersRes.data as { id: string; order_number: string }[] | null) ?? []).map((o) => [o.id, o.order_number]));
    setEntries(history.map((h) => ({ ...h, order_number: numbers.get(h.order_id) ?? 'Unknown order' })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const statuses = useMemo(() => Array.from(new Set(entries.map((e) => e.new_status))).sort(), [entries]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (statusFilter !== 'all' && e.new_status !== statusFilter) return false;
      if (q && !e.order_number.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, statusFilter, search]);

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/admin')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to admin
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-900">Order audit trail</h1>
        <p className="text-sm text-brand-500 mt-1">Every recorded order status change, newest first. Showing the latest {PAGE_SIZE} changes.</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order number"
          className="h-10 flex-1 min-w-[200px] rounded-lg border border-brand-200 bg-white px-3 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-lg border border-brand-200 bg-white px-3 text-sm text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{getOrderStatusLabel(s)}</option>
          ))}
        </select>
      </div>

      {error && <div className="mb-4"><FormAlert tone="error">{error}</FormAlert></div>}

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 bg-cream-100 rounded-xl" />)}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="No audit entries"
          description={entries.length === 0 ? 'No order status changes have been recorded yet.' : 'No entries match your filters.'}
        />
      ) : (
        <div className="bg-white rounded-xl border border-brand-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left text-xs uppercase tracking-wide text-brand-500">
              <tr>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Change</th>
                <th className="px-4 py-3 font-semibold">By</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {visible.map((e) => (
                <tr key={e.id} className="hover:bg-cream-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-brand-600">{formatDateTime(e.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-brand-900 whitespace-nowrap">
                    <button onClick={() => navigate(`/orders/${e.order_id}`)} className="hover:text-brand-600 underline-offset-2 hover:underline">
                      {e.order_number}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-brand-500">{getOrderStatusLabel(e.old_status)}</span>
                      <span className="text-brand-400">to</span>
                      <Badge variant={statusBadgeVariant(e.new_status)}>{getOrderStatusLabel(e.new_status)}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-brand-600 whitespace-nowrap">{getActorLabel(e.actor_role)}</td>
                  <td className="px-4 py-3 text-brand-600">{e.reason ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6">
        <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
      </div>
    </div>
  );
}
