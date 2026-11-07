import { useEffect, useState } from 'react';
import { Shield, Users, Package, Flag, Store, ArrowLeft, BarChart3, MapPin, FolderTree, Layers, ClipboardList, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';

export function AdminPage() {
  const { user, role } = useAuth();
  const [tab, setTab] = useState<'overview' | 'reports' | 'products' | 'sellers'>('overview');
  const [stats, setStats] = useState({ products: 0, sellers: 0, users: 0, reports: 0, orders: 0 });
  const [reports, setReports] = useState<{ id: string; target_type: string; reason: string; status: string; created_at: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [prod, seller, usr, rep, ord] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('seller_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('reports').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*', { count: 'exact', head: true }),
      ]);
      setStats({
        products: prod.count ?? 0,
        sellers: seller.count ?? 0,
        users: usr.count ?? 0,
        reports: rep.count ?? 0,
        orders: ord.count ?? 0,
      });

      const { data: repData } = await supabase
        .from('reports')
        .select('id, target_type, reason, status, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      setReports(repData ?? []);
    })();
  }, [user]);

  if (!user) {
    return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  }

  if (role !== 'administrator' && role !== 'super_admin' && role !== 'moderator') {
    return (
      <div className="container-app py-12">
        <EmptyState
          icon={<Shield className="h-8 w-8" />}
          title="Access denied"
          description="You need administrator or moderator permissions to access this page."
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </button>
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 text-white">
          <Shield className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Administration</h1>
          <p className="text-sm text-brand-500 capitalize">{role} panel</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-brand-100 overflow-x-auto scrollbar-hide">
        {(['overview', 'reports', 'products', 'sellers'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px shrink-0 ${
              tab === t ? 'text-brand-700 border-brand-600' : 'text-brand-400 border-transparent hover:text-brand-600'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <AdminStat icon={<Package className="h-6 w-6" />} label="Products" value={stats.products} />
            <AdminStat icon={<Store className="h-6 w-6" />} label="Sellers" value={stats.sellers} />
            <AdminStat icon={<Users className="h-6 w-6" />} label="Users" value={stats.users} />
            <AdminStat icon={<Flag className="h-6 w-6" />} label="Reports" value={stats.reports} />
            <AdminStat icon={<BarChart3 className="h-6 w-6" />} label="Orders" value={stats.orders} />
          </div>
          {(role === 'administrator' || role === 'super_admin') && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-brand-100 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-brand-900">Municipalities and barangays</p>
                  <p className="text-sm text-brand-500">Add, edit, or import the official location records.</p>
                </div>
                <Button variant="outline" onClick={() => navigate('/admin/locations')}>
                  <MapPin className="h-4 w-4" /> Manage locations
                </Button>
              </div>
              <div className="bg-white rounded-xl border border-brand-100 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-brand-900">Users and roles</p>
                  <p className="text-sm text-brand-500">Assign roles, activate sellers, suspend or restore accounts.</p>
                </div>
                <Button variant="outline" onClick={() => navigate('/admin/users')}>
                  <Users className="h-4 w-4" /> Manage users
                </Button>
              </div>
              <div className="bg-white rounded-xl border border-brand-100 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-brand-900">Categories and subcategories</p>
                  <p className="text-sm text-brand-500">Create, edit, reorder, and manage product categories.</p>
                </div>
                <Button variant="outline" onClick={() => navigate('/admin/categories')}>
                  <FolderTree className="h-4 w-4" /> Manage categories
                </Button>
              </div>
              <div className="bg-white rounded-xl border border-brand-100 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-brand-900">Product conditions</p>
                  <p className="text-sm text-brand-500">Create, edit, activate, and reorder condition options for listings.</p>
                </div>
                <Button variant="outline" onClick={() => navigate('/admin/conditions')}>
                  <Layers className="h-4 w-4" /> Manage conditions
                </Button>
              </div>
              <div className="bg-white rounded-xl border border-brand-100 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-brand-900">Order audit trail</p>
                  <p className="text-sm text-brand-500">Review every recorded order status change and who made it.</p>
                </div>
                <Button variant="outline" onClick={() => navigate('/admin/audit')}>
                  <ClipboardList className="h-4 w-4" /> View audit trail
                </Button>
              </div>
              <div className="bg-white rounded-xl border border-brand-100 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-brand-900">Review moderation</p>
                  <p className="text-sm text-brand-500">Handle reported product reviews, hide or restore content, and record moderation reasons.</p>
                </div>
                <Button variant="outline" onClick={() => navigate('/admin/reviews')}>
                  <Star className="h-4 w-4" /> Moderate reviews
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'reports' && (
        <div>
          {reports.length > 0 ? (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="bg-white rounded-xl border border-brand-100 p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="warning">{r.reason}</Badge>
                      <Badge variant={r.status === 'pending' ? 'default' : r.status === 'resolved' ? 'success' : 'info'}>{r.status}</Badge>
                    </div>
                    <p className="text-xs text-brand-400">Target: {r.target_type} · {formatDate(r.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Flag className="h-8 w-8" />} title="No reports" description="Content reports from users will appear here." />
          )}
        </div>
      )}

      {tab === 'products' && (
        <EmptyState icon={<Package className="h-8 w-8" />} title="Product management" description="Detailed product management tools will be available in the next phase." />
      )}
      {tab === 'sellers' && (
        <EmptyState icon={<Store className="h-8 w-8" />} title="Seller management" description="Seller verification and management tools will be available in the next phase." />
      )}
    </div>
  );
}

function AdminStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-brand-100 p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 mb-3">{icon}</div>
      <p className="text-2xl font-bold text-brand-900">{value}</p>
      <p className="text-xs text-brand-400 mt-1">{label}</p>
    </div>
  );
}
