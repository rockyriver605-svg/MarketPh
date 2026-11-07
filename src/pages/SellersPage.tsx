import { useEffect, useState } from 'react';
import { Store, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import type { SellerProfile, Municipality } from '@/types';
import { SellerCard } from '@/components/ProductCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

export function SellersPage() {
  const [sellers, setSellers] = useState<(SellerProfile & { municipality?: Municipality | null })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('seller_profiles')
        .select('*, municipality:municipalities(*)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      setSellers(data as (SellerProfile & { municipality?: Municipality | null })[] ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </button>
      <h1 className="text-2xl font-bold text-brand-900 mb-2">Sellers in Marinduque</h1>
      <p className="text-sm text-brand-500 mb-6">Discover local shops and sellers across the province</p>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 bg-cream-100 rounded-xl animate-pulse" />)}
        </div>
      ) : sellers.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sellers.map((seller) => (
            <SellerCard key={seller.id} seller={seller} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Store className="h-8 w-8" />}
          title="No sellers yet"
          description="Be the first to open a store on MariMarket!"
          action={<Button onClick={() => navigate('/seller/setup')}>Become a Seller</Button>}
        />
      )}
    </div>
  );
}
