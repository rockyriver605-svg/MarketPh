import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Store, Package, ShoppingCart, CreditCard, TrendingUp,
  Search, CheckCircle2, Clock, LogIn, X, BookOpen, ArrowRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { SellerProfile } from '@/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';
import {
  TOOL_GUIDES, CATEGORY_LABELS, CATEGORY_ORDER,
  type ToolGuide,
} from '@/lib/toolGuides';

export function BusinessToolsPage() {
  const { user } = useAuth();
  const [sellerProfile, setSellerProfile] = useState<SellerProfile | null>(null);
  const [search, setSearch] = useState('');
  const [selectedTool, setSelectedTool] = useState<ToolGuide | null>(null);
  const [stats, setStats] = useState<{ products: number; lowStock: number; posToday: number; outstandingCredit: number }>({
    products: 0, lowStock: 0, posToday: 0, outstandingCredit: 0,
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: sp } = await supabase
        .from('seller_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      const profile = sp as SellerProfile | null;
      setSellerProfile(profile);
      if (profile) {
        const [prodRes, lowStockRes, posRes, creditRes] = await Promise.all([
          supabase.from('products').select('id', { count: 'exact', head: true }).eq('seller_id', profile.id),
          supabase.from('products').select('id', { count: 'exact', head: true }).eq('seller_id', profile.id).lt('stock', 5),
          supabase.from('pos_transactions').select('id', { count: 'exact', head: true }).eq('seller_id', profile.id).gte('created_at', new Date().toISOString().split('T')[0]),
          supabase.from('credit_ledger').select('balance').eq('seller_id', profile.id).in('status', ['unpaid', 'partial', 'overdue']),
        ]);
        const outstandingCredit = ((creditRes.data as { balance: number }[] | null) ?? []).reduce((sum, r) => sum + Number(r.balance), 0);
        setStats({
          products: prodRes.count ?? 0,
          lowStock: lowStockRes.count ?? 0,
          posToday: posRes.count ?? 0,
          outstandingCredit,
        });
      }
    })();
  }, [user]);

  const filteredModules = useMemo(() => {
    if (!search.trim()) return TOOL_GUIDES;
    const q = search.toLowerCase();
    return TOOL_GUIDES.filter(
      (m) => m.title.toLowerCase().includes(q) || m.description.toLowerCase().includes(q),
    );
  }, [search]);

  const handleCardClick = (tool: ToolGuide) => {
    setSelectedTool(tool);
  };

  const handleOpenTool = (tool: ToolGuide) => {
    setSelectedTool(null);
    if (!user) {
      navigate('/signin');
      return;
    }
    if (tool.id === 'product-catalog') {
      navigate('/seller/dashboard');
      return;
    }
    navigate(`/seller/tools/${tool.id}`);
  };

  const readyCount = TOOL_GUIDES.filter((m) => m.status === 'ready').length;
  const isSignedIn = !!user;
  const isSeller = !!sellerProfile;

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate(isSeller ? '/seller/dashboard' : '/')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> {isSeller ? 'Back to dashboard' : 'Back to home'}
      </button>

      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Store className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Business Tools</h1>
          <p className="text-sm text-brand-500">
            {isSeller ? sellerProfile!.shop_name : 'MariMarket Seller Tools'}
          </p>
        </div>
      </div>
      <p className="text-sm text-brand-600 mb-6 max-w-2xl">
        Manage your store operations with integrated tools for sales, inventory, customer credit,
        and analytics. Click any tool to learn how it works and get started.
      </p>

      {/* Sign-in banner for non-authenticated visitors */}
      {!isSignedIn && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white shrink-0">
            <LogIn className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-brand-900">Sign in to use these tools</p>
            <p className="text-xs text-brand-600 mt-0.5">
              Browse all tools and read how each one works. Sign in with a seller account to access them.
            </p>
          </div>
          <Button size="sm" onClick={() => navigate('/signin')}>Sign In</Button>
        </div>
      )}

      {/* Stats overview — only for authenticated sellers */}
      {isSeller && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-brand-100 p-4">
            <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4 text-brand-500" /><span className="text-xs text-brand-500">Products</span></div>
            <p className="text-xl font-bold text-brand-900">{stats.products}</p>
          </div>
          <div className="bg-white rounded-xl border border-brand-100 p-4">
            <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-amber-500" /><span className="text-xs text-brand-500">Low Stock</span></div>
            <p className="text-xl font-bold text-brand-900">{stats.lowStock}</p>
          </div>
          <div className="bg-white rounded-xl border border-brand-100 p-4">
            <div className="flex items-center gap-2 mb-1"><ShoppingCart className="h-4 w-4 text-blue-500" /><span className="text-xs text-brand-500">POS Today</span></div>
            <p className="text-xl font-bold text-brand-900">{stats.posToday}</p>
          </div>
          <div className="bg-white rounded-xl border border-brand-100 p-4">
            <div className="flex items-center gap-2 mb-1"><CreditCard className="h-4 w-4 text-red-500" /><span className="text-xs text-brand-500">Outstanding Credit</span></div>
            <p className="text-xl font-bold text-brand-900">{formatCurrency(stats.outstandingCredit)}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search business tools..."
          className="w-full h-11 pl-10 pr-4 rounded-xl border border-brand-200 bg-white text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      {/* Summary count */}
      <div className="flex items-center gap-4 mb-6 text-sm">
        <span className="flex items-center gap-1.5 text-brand-600">
          <CheckCircle2 className="h-4 w-4 text-green-500" /> {readyCount} available
        </span>
        <span className="flex items-center gap-1.5 text-brand-400">
          <Clock className="h-4 w-4" /> {TOOL_GUIDES.length - readyCount} coming soon
        </span>
      </div>

      {/* Tool cards by category */}
      {filteredModules.length > 0 ? (
        CATEGORY_ORDER.map((cat) => {
          const modules = filteredModules.filter((m) => m.category === cat);
          if (modules.length === 0) return null;
          return (
            <div key={cat} className="mb-8">
              <h2 className="text-lg font-semibold text-brand-900 mb-3">{CATEGORY_LABELS[cat]}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {modules.map((mod) => {
                  const Icon = mod.icon;
                  const isReady = mod.status === 'ready';
                  return (
                    <button
                      key={mod.id}
                      onClick={() => handleCardClick(mod)}
                      className="text-left bg-white rounded-xl border border-brand-100 p-5 transition-all hover:shadow-md hover:border-brand-200 group cursor-pointer animate-fade-in"
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 shrink-0 group-hover:bg-brand-100 group-hover:scale-110 transition-all">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-brand-900">{mod.title}</h3>
                          <span className={`inline-flex items-center gap-1 mt-1 text-xs font-medium ${isReady ? 'text-green-600' : 'text-brand-400'}`}>
                            {isReady ? <><CheckCircle2 className="h-3 w-3" /> Available</> : <><Clock className="h-3 w-3" /> Coming soon</>}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-brand-600">{mod.description}</p>
                      <p className="text-xs text-brand-400 mt-2 flex items-center gap-1 font-medium group-hover:text-brand-600 transition-colors">
                        <BookOpen className="h-3 w-3" /> Click to learn how to use this tool
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })
      ) : (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="No tools found"
          description={`No business tools match "${search}". Try a different search term.`}
          action={<Button variant="outline" onClick={() => setSearch('')}>Clear Search</Button>}
        />
      )}

      {/* How to Use modal */}
      <ToolGuideModal
        tool={selectedTool}
        isSignedIn={isSignedIn}
        onClose={() => setSelectedTool(null)}
        onOpen={handleOpenTool}
      />
    </div>
  );
}

function ToolGuideModal({
  tool, isSignedIn, onClose, onOpen,
}: {
  tool: ToolGuide | null;
  isSignedIn: boolean;
  onClose: () => void;
  onOpen: (tool: ToolGuide) => void;
}) {
  if (!tool) return null;
  const Icon = tool.icon;
  const isReady = tool.status === 'ready';

  return (
    <Modal open={!!tool} onClose={onClose} size="lg">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 shrink-0">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brand-900">{tool.title}</h2>
            <span className={`inline-flex items-center gap-1 mt-0.5 text-xs font-medium ${isReady ? 'text-green-600' : 'text-brand-400'}`}>
              {isReady ? <><CheckCircle2 className="h-3 w-3" /> Available</> : <><Clock className="h-3 w-3" /> Coming soon</>}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-brand-400 hover:text-brand-600 transition-colors p-1 rounded-lg hover:bg-brand-50 shrink-0">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* What it does */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-brand-900 mb-1.5 flex items-center gap-1.5">
          <BookOpen className="h-4 w-4 text-brand-500" /> What this tool does
        </h3>
        <p className="text-sm text-brand-600 leading-relaxed">{tool.whatItDoes}</p>
      </div>

      {/* How to use — step by step */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-brand-900 mb-3">How to use it</h3>
        <div className="space-y-2.5">
          {tool.howToUse.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold shrink-0">
                {i + 1}
              </div>
              <p className="text-sm text-brand-600 leading-relaxed pt-0.5">{step}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Action area */}
      {isReady ? (
        <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-brand-100">
          <Button className="flex-1" onClick={() => onOpen(tool)}>
            Open this tool <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      ) : (
        <div className="pt-4 border-t border-brand-100">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
            <p className="text-sm text-amber-700">
              This tool is coming soon. The database is already prepared — once it's built, your
              existing products and store data will work with it automatically.
            </p>
          </div>
          {isSignedIn ? (
            <Button variant="outline" onClick={onClose} className="w-full">Back to Business Tools</Button>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="flex-1" onClick={() => onOpen(tool)}>
                <LogIn className="h-4 w-4" /> Sign in to get notified
              </Button>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
