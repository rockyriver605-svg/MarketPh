import { useEffect, useState, useCallback } from 'react';
import { SlidersHorizontal, X, ShoppingBag, LocateFixed } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ProductWithRelations, Category, Municipality, ProductConditionOption } from '@/types';
import { ProductCard } from '@/components/ProductCard';
import { LocationSelect } from '@/components/location/LocationSelect';
import { findNearbyMunicipality } from '@/lib/nearbyMunicipality';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { useRouter } from '@/lib/router';

export function BrowsePage() {
  const { route, navigate } = useRouter();
  const [products, setProducts] = useState<ProductWithRelations[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [conditions, setConditions] = useState<ProductConditionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [nearbyBusy, setNearbyBusy] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);

  const searchQuery = route.query.q ?? '';
  const categorySlug = route.query.category ?? '';
  const municipalityId = route.query.muni ?? '';
  const barangayId = route.query.brgy ?? '';
  const nearby = route.query.near === '1';
  const conditionFilter = route.query.condition ?? '';
  const sortBy = route.query.sort ?? 'newest';

  useEffect(() => {
    (async () => {
      const [{ data: catData }, { data: muniData }, { data: condData }] = await Promise.all([
        supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('municipalities').select('*').order('name'),
        supabase.from('product_conditions').select('*').eq('is_active', true).order('sort_order'),
      ]);
      setCategories(catData as Category[] ?? []);
      setMunicipalities(muniData as Municipality[] ?? []);
      setConditions(condData as ProductConditionOption[] ?? []);
    })();
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    let query = supabase
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
      .eq('status', 'published');

    if (searchQuery) {
      query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
    }

    if (categorySlug) {
      const cat = categories.find((c) => c.slug === categorySlug);
      if (cat) query = query.eq('category_id', cat.id);
    }

    if (barangayId) {
      query = query.eq('barangay_id', barangayId);
    } else if (municipalityId) {
      query = query.eq('municipality_id', municipalityId);
    }

    if (conditionFilter) {
      query = query.eq('condition', conditionFilter);
    }

    switch (sortBy) {
      case 'price_low': query = query.order('price', { ascending: true }); break;
      case 'price_high': query = query.order('price', { ascending: false }); break;
      case 'oldest': query = query.order('created_at', { ascending: true }); break;
      default: query = query.order('created_at', { ascending: false });
    }

    const { data } = await query.limit(48);
    setProducts(data as ProductWithRelations[] ?? []);
    setLoading(false);
  }, [searchQuery, categorySlug, municipalityId, barangayId, conditionFilter, sortBy, categories]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const updateFilter = (key: string, value: string) => {
    const newQuery = { ...route.query };
    if (value) {
      newQuery[key] = value;
    } else {
      delete newQuery[key];
    }
    const params = new URLSearchParams(newQuery);
    navigate(`/browse?${params.toString()}`);
  };

  const updateLocation = (muni: string, brgy: string) => {
    const newQuery = { ...route.query };
    delete newQuery.muni;
    delete newQuery.brgy;
    delete newQuery.near;
    if (muni) newQuery.muni = muni;
    if (brgy) newQuery.brgy = brgy;
    navigate(`/browse?${new URLSearchParams(newQuery).toString()}`);
  };

  const handleNearby = async () => {
    setNearbyBusy(true);
    setNearbyError(null);
    try {
      const match = await findNearbyMunicipality(municipalities);
      const newQuery: Record<string, string> = { ...route.query, muni: match.id, near: '1' };
      delete newQuery.brgy;
      navigate(`/browse?${new URLSearchParams(newQuery).toString()}`);
    } catch (err) {
      setNearbyError(err instanceof Error ? err.message : 'Could not find nearby products.');
    } finally {
      setNearbyBusy(false);
    }
  };

  const clearFilters = () => {
    navigate('/browse');
  };

  const hasFilters = searchQuery || categorySlug || municipalityId || barangayId || nearby || conditionFilter;

  return (
    <div className="container-app py-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Browse Marketplace</h1>
          <p className="text-sm text-brand-500 mt-1">
            {loading ? 'Searching...' : `${products.length} product${products.length !== 1 ? 's' : ''} found`}
            {searchQuery && ` for "${searchQuery}"`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={sortBy}
            onChange={(e) => updateFilter('sort', e.target.value)}
            className="w-auto h-10 text-sm"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="lg:hidden">
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </Button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar filters */}
        <aside className={`${showFilters ? 'fixed inset-0 z-40 bg-white p-4 overflow-y-auto' : 'hidden'} lg:block lg:relative lg:w-64 lg:shrink-0 lg:bg-transparent lg:p-0`}>
          {showFilters && (
            <div className="flex items-center justify-between mb-4 lg:hidden">
              <h2 className="text-lg font-semibold">Filters</h2>
              <button onClick={() => setShowFilters(false)}><X className="h-5 w-5" /></button>
            </div>
          )}
          <div className="space-y-5">
            <FilterSection title="Category">
              <select
                value={categorySlug}
                onChange={(e) => updateFilter('category', e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-brand-200 bg-white text-sm"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.slug}>{cat.name}</option>
                ))}
              </select>
            </FilterSection>

            <FilterSection title="Location">
              <LocationSelect
                stacked
                municipalities={municipalities}
                municipalityId={municipalityId}
                barangayId={barangayId}
                municipalityPlaceholder="Entire Marinduque"
                onMunicipalityChange={(id) => updateLocation(id, '')}
                onBarangayChange={(id) => updateLocation(municipalityId, id)}
              />
              <div className="mt-3 space-y-2">
                <Button variant="outline" size="sm" className="w-full" onClick={handleNearby} loading={nearbyBusy}>
                  <LocateFixed className="h-4 w-4" /> Products near me
                </Button>
                {nearby && (
                  <p className="text-xs text-brand-600">Showing products in your municipality, based on your location.</p>
                )}
                {nearbyError && <p className="text-xs text-red-600">{nearbyError}</p>}
              </div>
            </FilterSection>

            <FilterSection title="Condition">
              <select
                value={conditionFilter}
                onChange={(e) => updateFilter('condition', e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-brand-200 bg-white text-sm"
              >
                <option value="">All Conditions</option>
                {conditions.map((c) => (
                  <option key={c.id} value={c.value}>{c.label}</option>
                ))}
              </select>
            </FilterSection>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full">
                Clear All Filters
              </Button>
            )}
          </div>
        </aside>

        {/* Products grid */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
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
          ) : products.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ShoppingBag className="h-8 w-8" />}
              title="No products found"
              description={hasFilters
                ? "Try adjusting your filters or search terms to find what you're looking for."
                : "No products have been listed yet. Be the first to sell on MariMarket!"
              }
              action={hasFilters
                ? <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
                : <Button onClick={() => navigate('/seller/setup')}>Become a Seller</Button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-brand-900 mb-2">{title}</h3>
      {children}
    </div>
  );
}
