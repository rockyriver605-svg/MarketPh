import { useEffect, useState } from 'react';
import { Store, ArrowLeft, Package, MapPin, Star, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import { useAuth } from '@/contexts/AuthContext';
import { openSellerConversation } from '@/lib/conversations';
import { fetchSellerRatingSummary, type SellerRatingSummary } from '@/lib/sellerRatings';
import type { SellerProfile, ProductWithRelations, Municipality } from '@/types';
import { ProductCard } from '@/components/ProductCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

interface SellerStorefrontPageProps {
  slug: string;
}

export function SellerStorefrontPage({ slug }: SellerStorefrontPageProps) {
  const { user } = useAuth();
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [products, setProducts] = useState<ProductWithRelations[]>([]);
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [ratingSummary, setRatingSummary] = useState<SellerRatingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: sellerData } = await supabase
        .from('seller_profiles')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();
      const activeSeller = sellerData as SellerProfile | null;
      setSeller(activeSeller);

      if (activeSeller) {
        const [{ data: muniData }, { data: prodData }, summary] = await Promise.all([
          supabase.from('municipalities').select('*').eq('id', activeSeller.municipality_id).maybeSingle(),
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
            .eq('seller_id', activeSeller.id)
            .eq('status', 'published')
            .order('created_at', { ascending: false }),
          fetchSellerRatingSummary(activeSeller.id),
        ]);
        setMunicipality(muniData as Municipality | null);
        setProducts((prodData as ProductWithRelations[]) ?? []);
        setRatingSummary(summary);
      }
      setLoading(false);
    })();
  }, [slug]);

  const isOwnStore = !!user && !!seller && seller.user_id === user.id;

  const handleContactSeller = async () => {
    if (!seller) return;
    if (!user) {
      navigate('/signin');
      return;
    }
    setContactBusy(true);
    setContactError(null);
    try {
      const conversationId = await openSellerConversation(user.id, seller.user_id, null);
      navigate(`/messages?c=${conversationId}`);
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'Could not start a conversation.');
    } finally {
      setContactBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="container-app py-12 animate-pulse">
        <div className="h-48 bg-cream-100 rounded-xl mb-6" />
        <div className="h-8 bg-cream-100 rounded w-1/3 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-brand-100 overflow-hidden">
              <div className="aspect-square bg-cream-100" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-cream-100 rounded w-3/4" />
                <div className="h-5 bg-cream-100 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="container-app py-12">
        <EmptyState
          icon={<Store className="h-8 w-8" />}
          title="Store not found"
          description="This seller storefront may not exist or has been deactivated."
          action={<Button onClick={() => navigate('/sellers')}>Browse Sellers</Button>}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Banner */}
      <div className="relative h-48 sm:h-64 bg-gradient-to-br from-brand-700 to-brand-900 overflow-hidden">
        {seller.banner_url && (
          <img src={seller.banner_url} alt="" className="w-full h-full object-cover" />
        )}
        <button onClick={() => navigate('/sellers')} className="absolute top-4 left-4 flex items-center gap-1 text-sm text-white/80 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> All sellers
        </button>
      </div>

      <div className="container-app">
        {/* Shop header */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 mb-8 relative z-10">
          <div className="flex h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-white border-4 border-white shadow-lg overflow-hidden shrink-0">
            {seller.logo_url ? (
              <img src={seller.logo_url} alt={seller.shop_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-brand-50 text-brand-600">
                <Store className="h-10 w-10" />
              </div>
            )}
          </div>
          <div className="flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-brand-900">{seller.shop_name}</h1>
              {seller.is_verified && <Badge variant="success"><Star className="h-3 w-3" /> Verified</Badge>}
            </div>
            {municipality && (
              <div className="flex items-center gap-1 text-sm text-brand-500">
                <MapPin className="h-4 w-4" /> {municipality.name}, Marinduque
              </div>
            )}
            <div className="flex items-center gap-1 text-sm text-brand-500 mt-1">
              <Star className="h-4 w-4 text-amber-500" />
              {ratingSummary && ratingSummary.total_reviews > 0
                ? `${ratingSummary.avg_rating.toFixed(1)} seller rating from ${ratingSummary.total_reviews} ${ratingSummary.total_reviews === 1 ? 'review' : 'reviews'}`
                : 'No seller reviews yet'}
            </div>
          </div>
          {!isOwnStore && (
            <div className="sm:pb-1 shrink-0">
              <Button onClick={handleContactSeller} disabled={contactBusy} variant="outline">
                <MessageCircle className="h-4 w-4" /> {contactBusy ? 'Opening chat...' : 'Contact Seller'}
              </Button>
              {contactError && <p className="mt-2 text-sm text-red-600">{contactError}</p>}
            </div>
          )}
        </div>

        {/* Description */}
        {seller.description && (
          <div className="mb-8 max-w-2xl">
            <p className="text-sm text-brand-600 leading-relaxed">{seller.description}</p>
          </div>
        )}

        {/* Products */}
        <div className="pb-16">
          <h2 className="text-xl font-bold text-brand-900 mb-4">Products ({products.length})</h2>
          {products.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="No products yet"
              description="This seller hasn't listed any products yet. Check back soon!"
            />
          )}
        </div>
      </div>
    </div>
  );
}
