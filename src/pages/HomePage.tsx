import { useCallback, useEffect, useState } from 'react';
import {
  Store, ShoppingBag, MapPin, ArrowRight, Sprout, Fish, UtensilsCrossed, Scissors,
  Shirt, Heart, Home, Smartphone, Wrench, Briefcase, Search, Truck, ShieldCheck,
  MessageCircle, Sparkles, TrendingUp, Users, Milk, Bike, Dumbbell, Gamepad2, BookOpen, Package, Hammer,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useAuth } from '@/contexts/AuthContext';
import type { ProductWithRelations, Category, Municipality, SellerProfile } from '@/types';
import { ProductCard, SellerCard } from '@/components/ProductCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Wheat: Sprout, Fish, UtensilsCrossed, Scissors, Shirt, Heart, Home, Smartphone, Wrench, Briefcase,
  Milk, Bike, Dumbbell, Gamepad2, BookOpen, Package, Hammer, Sprout,
};

interface SellerWithMuni extends SellerProfile {
  municipality?: { name: string } | null;
}

interface CategoryWithCount extends Category {
  product_count: number;
}

export function HomePage() {
  const { user, role } = useAuth();
  const [products, setProducts] = useState<ProductWithRelations[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<ProductWithRelations[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [sellers, setSellers] = useState<SellerWithMuni[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catRes, prodRes, featuredRes, sellerRes, muniRes] = await Promise.all([
        supabase.from('categories').select('*').eq('is_active', true).is('parent_id', null).order('sort_order'),
        supabase
          .from('products')
          .select(`
            *,
            seller:seller_profiles(*),
            category:categories(*),
            municipality:municipalities(*),
            barangay:barangays(*),
            product_images(*),
            product_variants(*)
          `)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('products')
          .select(`
            *,
            seller:seller_profiles(*),
            category:categories(*),
            municipality:municipalities(*),
            barangay:barangays(*),
            product_images(*),
            product_variants(*)
          `)
          .eq('status', 'published')
          .order('view_count', { ascending: false })
          .limit(4),
        supabase
          .from('seller_profiles')
          .select('*, municipality:municipalities(name)')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(6),
        supabase.from('municipalities').select('*').order('name'),
      ]);

      if (catRes.error) throw catRes.error;

      const catList = (catRes.data as Category[]) ?? [];
      const prodList = (prodRes.data as ProductWithRelations[]) ?? [];
      const featuredList = (featuredRes.data as ProductWithRelations[]) ?? [];
      const sellerList = (sellerRes.data as SellerWithMuni[]) ?? [];
      const muniList = (muniRes.data as Municipality[]) ?? [];

      const categoriesWithCounts: CategoryWithCount[] = catList.map((cat) => ({
        ...cat,
        product_count: prodList.filter((p) => p.category_id === cat.id).length,
      }));

      setCategories(categoriesWithCounts);
      setProducts(prodList);
      setFeaturedProducts(featuredList);
      setSellers(sellerList);
      setMunicipalities(muniList);
    } catch {
      setError('Could not load marketplace data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/browse?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/browse');
    }
  };

  const popularCategories = [...categories].sort((a, b) => b.product_count - a.product_count).slice(0, 5);
  const hasProducts = products.length > 0;
  const hasSellers = sellers.length > 0;
  const canSell = role === 'buyer' || role === 'seller' || role === 'administrator' || role === 'super_admin' || !user;

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="container-app relative py-14 sm:py-20 lg:py-24">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium mb-5">
              <MapPin className="h-3 w-3" />
              Province of Marinduque, Philippines
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-display leading-[1.1] mb-5">
              Buy and sell locally across <span className="text-accent-400">Marinduque</span>
            </h1>
            <p className="text-lg text-brand-100 mb-8 max-w-xl leading-relaxed">
              From Boac to Santa Cruz, discover products from your community. Fresh produce, handmade crafts, local services, and more.
            </p>
            <form onSubmit={handleSearch} className="flex gap-2 max-w-lg mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-brand-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for products, crafts, services..."
                  className="w-full h-12 pl-11 pr-4 rounded-xl border border-white/20 bg-white/95 text-sm text-brand-950 placeholder:text-brand-400 focus:outline-none focus:ring-2 focus:ring-accent-400"
                />
              </div>
              <Button type="submit" size="lg" variant="accent" className="shrink-0">
                Search
              </Button>
            </form>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20" onClick={() => navigate('/browse')}>
                Browse Marketplace <ArrowRight className="h-4 w-4" />
              </Button>
              {canSell && (
                <Button size="lg" variant="ghost" className="text-white hover:bg-white/10" onClick={() => navigate(user ? '/seller/setup' : '/signup')}>
                  <Store className="h-4 w-4" /> Start Selling
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="border-b border-brand-100 bg-white">
        <div className="container-app py-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8">
            <TrustBadge icon={<Truck className="h-5 w-5" />} title="Local Delivery" description="Across all 6 municipalities" />
            <TrustBadge icon={<ShieldCheck className="h-5 w-5" />} title="Verified Sellers" description="Community-trusted storefronts" />
            <TrustBadge icon={<MessageCircle className="h-5 w-5" />} title="Direct Messaging" description="Talk to sellers directly" />
          </div>
        </div>
      </section>

      {error && (
        <section className="container-app py-8">
          <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
            {error}
            <Button variant="ghost" size="sm" onClick={loadAll}>Retry</Button>
          </div>
        </section>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <section className="container-app py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-brand-900">Shop by Category</h2>
            <button onClick={() => navigate('/categories')} className="text-sm font-medium text-brand-600 hover:text-brand-800 flex items-center gap-1 transition-colors">
              All categories <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-3">
            {categories.map((cat) => {
              const Icon = categoryIcons[cat.icon_name ?? ''] ?? ShoppingBag;
              return (
                <button
                  key={cat.id}
                  onClick={() => navigate(`/browse?category=${cat.slug}`)}
                  className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-brand-100 shadow-sm hover:shadow-md hover:border-brand-200 transition-all group"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 group-hover:bg-brand-100 transition-colors">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-medium text-brand-700 text-center leading-tight">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Popular categories */}
      {hasProducts && popularCategories.length > 0 && (
        <section className="bg-cream-50 py-12">
          <div className="container-app">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="h-5 w-5 text-accent-500" />
              <h2 className="text-2xl font-bold text-brand-900">Popular Categories</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {popularCategories.map((cat) => {
                const Icon = categoryIcons[cat.icon_name ?? ''] ?? ShoppingBag;
                return (
                  <button
                    key={cat.id}
                    onClick={() => navigate(`/browse?category=${cat.slug}`)}
                    className="flex items-center gap-3 bg-white rounded-xl border border-brand-100 p-4 hover:shadow-md hover:border-brand-200 transition-all group"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-50 text-accent-600 group-hover:bg-accent-100 transition-colors shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-semibold text-brand-800 truncate">{cat.name}</p>
                      <p className="text-xs text-brand-400">{cat.product_count} listing{cat.product_count === 1 ? '' : 's'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Featured products */}
      <section className="container-app py-12">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="h-5 w-5 text-accent-500" />
          <h2 className="text-2xl font-bold text-brand-900">Featured Products</h2>
        </div>
        {loading ? (
          <ProductGridSkeleton count={4} />
        ) : featuredProducts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title="No featured products yet"
            description="Featured products will appear here based on views and popularity."
          />
        )}
      </section>

      {/* Latest products */}
      <section className="bg-cream-50 py-12">
        <div className="container-app">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-brand-900">Latest Listings</h2>
            {hasProducts && (
              <button onClick={() => navigate('/browse')} className="text-sm font-medium text-brand-600 hover:text-brand-800 flex items-center gap-1 transition-colors">
                View all <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
          {loading ? (
            <ProductGridSkeleton count={8} />
          ) : hasProducts ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ShoppingBag className="h-8 w-8" />}
              title="No products yet"
              description="Be the first to list a product on MariMarket. Your community is waiting."
              action={<Button onClick={() => navigate(user ? '/seller/setup' : '/signup')}><Store className="h-4 w-4" /> Become a Seller</Button>}
            />
          )}
        </div>
      </section>

      {/* Seller discovery */}
      <section className="container-app py-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-accent-500" />
            <h2 className="text-2xl font-bold text-brand-900">Local Sellers</h2>
          </div>
          {hasSellers && (
            <button onClick={() => navigate('/sellers')} className="text-sm font-medium text-brand-600 hover:text-brand-800 flex items-center gap-1 transition-colors">
              All sellers <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 bg-cream-100 rounded-xl animate-pulse" />)}
          </div>
        ) : hasSellers ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sellers.map((seller) => (
              <SellerCard key={seller.id} seller={seller} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Store className="h-8 w-8" />}
            title="No sellers yet"
            description="Be the first to open a storefront on MariMarket and reach buyers across Marinduque."
            action={<Button onClick={() => navigate(user ? '/seller/setup' : '/signup')}><Store className="h-4 w-4" /> Open a Storefront</Button>}
          />
        )}
      </section>

      {/* Municipality directory */}
      {municipalities.length > 0 && (
        <section className="bg-gradient-to-b from-brand-50 to-cream-50 py-12">
          <div className="container-app">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-brand-900 mb-2">Marketplaces Across Marinduque</h2>
              <p className="text-sm text-brand-500 max-w-lg mx-auto">Explore products from each of the six municipalities of Marinduque.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {municipalities.map((muni) => (
                <button
                  key={muni.id}
                  onClick={() => navigate(`/browse?muni=${muni.id}`)}
                  className="group flex flex-col items-center gap-2 p-5 bg-white rounded-xl border border-brand-100 shadow-sm hover:shadow-md hover:border-accent-200 transition-all"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 group-hover:bg-accent-50 group-hover:text-accent-600 transition-colors">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <span className="text-sm font-semibold text-brand-800 text-center">{muni.name}</span>
                  <span className="text-xs text-brand-400">Browse products</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Promotional / CTA section */}
      <section className="bg-brand-800 text-white py-14">
        <div className="container-app">
          <div className="max-w-2xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1 text-xs font-medium mb-4">
              <Store className="h-3 w-3" /> Start Selling Today
            </div>
            <h2 className="text-3xl font-bold font-display mb-4">Turn your craft into a business</h2>
            <p className="text-brand-200 mb-8 max-w-lg mx-auto">
              Join MariMarket and reach buyers across all six municipalities. List your products for free and connect with your community.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="lg" variant="accent" onClick={() => navigate(user ? '/seller/setup' : '/signup')}>
                Open a Storefront <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20" onClick={() => navigate('/browse')}>
                Browse Products
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white border-t border-brand-50 py-16">
        <div className="container-app">
          <h2 className="text-2xl font-bold text-brand-900 text-center mb-12">How MariMarket Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <HowItWorks
              icon={<ShoppingBag className="h-8 w-8" />}
              step="1"
              title="Browse & Discover"
              description="Search for products across all six municipalities of Marinduque. Filter by category, location, and price."
            />
            <HowItWorks
              icon={<Store className="h-8 w-8" />}
              step="2"
              title="Connect with Sellers"
              description="Message sellers directly, ask questions, and arrange pickup or delivery within Marinduque."
            />
            <HowItWorks
              icon={<MapPin className="h-8 w-8" />}
              step="3"
              title="Buy Locally"
              description="Support your community by buying from local sellers. Pay via cash on delivery, GCash, or bank transfer."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function TrustBadge({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-brand-800">{title}</p>
        <p className="text-xs text-brand-400">{description}</p>
      </div>
    </div>
  );
}

function ProductGridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-brand-100 overflow-hidden animate-pulse">
          <div className="aspect-square bg-cream-100" />
          <div className="p-3 space-y-2">
            <div className="h-4 bg-cream-100 rounded w-3/4" />
            <div className="h-3 bg-cream-100 rounded w-1/2" />
            <div className="h-5 bg-cream-100 rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function HowItWorks({ icon, step, title, description }: { icon: React.ReactNode; step: string; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        {icon}
        <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent-500 text-white text-xs font-bold">
          {step}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-brand-900 mb-2">{title}</h3>
      <p className="text-sm text-brand-500 leading-relaxed max-w-xs mx-auto">{description}</p>
    </div>
  );
}
