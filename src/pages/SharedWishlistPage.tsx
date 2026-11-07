import { useEffect, useState } from 'react';
import { AlertTriangle, ImageOff, Link2Off } from 'lucide-react';
import { fetchSharedWishlist, type SharedWishlist } from '@/lib/wishlist';
import { formatCurrency } from '@/lib/utils';
import { navigate } from '@/lib/router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

interface SharedWishlistPageProps {
  token: string;
}

const STATUS_BADGE = {
  published: { label: 'Available', variant: 'success' },
  paused: { label: 'Paused by seller', variant: 'warning' },
  sold_out: { label: 'Sold out', variant: 'error' },
} as const;

export function SharedWishlistPage({ token }: SharedWishlistPageProps) {
  const [wishlist, setWishlist] = useState<SharedWishlist | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    fetchSharedWishlist(token)
      .then((result) => {
        if (!active) return;
        if (result) {
          setWishlist(result);
          setStatus('ready');
        } else {
          setStatus('missing');
        }
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (status === 'loading') {
    return <div className="container-app py-12 animate-pulse"><div className="h-8 w-1/3 rounded bg-cream-100" /></div>;
  }

  if (status === 'missing') {
    return (
      <div className="container-app py-12">
        <EmptyState
          icon={<Link2Off className="h-8 w-8" />}
          title="This wishlist link is no longer active"
          description="The owner turned off sharing or the link is incorrect."
          action={<Button onClick={() => navigate('/browse')}>Browse products</Button>}
        />
      </div>
    );
  }

  if (status === 'error' || !wishlist) {
    return (
      <div className="container-app py-12">
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="This wishlist could not be loaded"
          description="Please try again in a moment."
          action={<Button onClick={() => navigate('/browse')}>Browse products</Button>}
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8 animate-fade-in">
      <h1 className="text-2xl font-bold text-brand-900">{wishlist.name}</h1>
      <p className="mb-6 text-sm text-brand-500">
        A shared wishlist from MariMarket. {wishlist.items.length} {wishlist.items.length === 1 ? 'item' : 'items'}.
      </p>
      {wishlist.items.length === 0 ? (
        <EmptyState title="Nothing here yet" description="This collection has no products right now." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {wishlist.items.map((item) => {
            const badge = STATUS_BADGE[item.status as keyof typeof STATUS_BADGE];
            const price = item.sale_price ?? item.price;
            return (
              <button
                key={item.product_id}
                type="button"
                onClick={() => navigate(`/product/${item.product_id}`)}
                className="flex flex-col overflow-hidden rounded-xl border border-brand-100 bg-white text-left shadow-sm transition-all duration-200 hover:border-brand-200 hover:shadow-md"
              >
                <div className="relative aspect-square bg-cream-100">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-brand-300"><ImageOff className="h-8 w-8" /></div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <span className="line-clamp-2 text-sm font-semibold text-brand-900">{item.title}</span>
                  <span className="text-base font-bold text-brand-800">{formatCurrency(price)}</span>
                  {item.shop_name && <span className="truncate text-xs text-brand-500">by {item.shop_name}</span>}
                  {badge && <span className="mt-auto pt-2"><Badge variant={badge.variant}>{badge.label}</Badge></span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
