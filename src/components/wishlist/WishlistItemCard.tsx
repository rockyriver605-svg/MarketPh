import { MapPin, Store, ShoppingCart, FolderOpen, Trash2, ImageOff } from 'lucide-react';
import type { WishlistItem } from '@/lib/wishlist';
import { getAvailability, unavailableReason, effectivePrice, AVAILABILITY_LABELS } from '@/lib/wishlistView';
import { formatCurrency, getConditionLabel, formatDate } from '@/lib/utils';
import { navigate } from '@/lib/router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface WishlistItemCardProps {
  item: WishlistItem;
  layout: 'grid' | 'list';
  collectionNames: string[];
  busy: boolean;
  onAddToCart: (item: WishlistItem) => void;
  onManageCollections: (item: WishlistItem) => void;
  onRemove: (item: WishlistItem) => void;
}

const AVAILABILITY_BADGE = {
  available: 'success',
  out_of_stock: 'warning',
  unavailable: 'error',
} as const;

export function WishlistItemCard({
  item,
  layout,
  collectionNames,
  busy,
  onAddToCart,
  onManageCollections,
  onRemove,
}: WishlistItemCardProps) {
  const availability = getAvailability(item);
  const reason = unavailableReason(item);
  const price = effectivePrice(item);
  const hasDiscount = item.sale_price !== null && item.sale_price < item.price;
  const isAvailable = availability === 'available';
  const isList = layout === 'list';

  const image = item.image_url ? (
    <img src={item.image_url} alt={item.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-cream-100 text-brand-300">
      <ImageOff className="h-8 w-8" />
    </div>
  );

  return (
    <article
      className={`group flex bg-white rounded-xl border border-brand-100 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md ${
        isList ? 'flex-row gap-4 p-3' : 'flex-col'
      } ${availability !== 'available' ? 'opacity-90' : ''}`}
    >
      <button
        type="button"
        onClick={() => navigate(`/product/${item.product_id}`)}
        className={`relative shrink-0 overflow-hidden bg-cream-100 rounded-lg ${isList ? 'h-28 w-28' : 'aspect-square w-full'}`}
        aria-label={`View ${item.title}`}
      >
        {image}
        {availability !== 'available' && (
          <span className="absolute inset-x-2 bottom-2">
            <Badge variant={AVAILABILITY_BADGE[availability]}>{reason ?? AVAILABILITY_LABELS[availability]}</Badge>
          </span>
        )}
      </button>

      <div className={`flex flex-col flex-1 min-w-0 ${isList ? '' : 'p-3'}`}>
        <button
          type="button"
          onClick={() => navigate(`/product/${item.product_id}`)}
          className="text-left text-sm font-semibold text-brand-900 line-clamp-2 hover:text-brand-600 transition-colors"
        >
          {item.title}
        </button>

        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-base font-bold text-brand-800">{formatCurrency(price)}</span>
          {hasDiscount && <span className="text-xs text-brand-400 line-through">{formatCurrency(item.price)}</span>}
        </div>

        <div className="mt-2 flex flex-col gap-1 text-xs text-brand-500">
          {item.shop_name && (
            <span className="flex items-center gap-1 truncate"><Store className="h-3 w-3 shrink-0" />{item.shop_name}</span>
          )}
          {item.municipality_name && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              {item.municipality_name}{item.barangay_name ? `, ${item.barangay_name}` : ''}
            </span>
          )}
          <span>
            {item.condition ? getConditionLabel(item.condition) : 'Condition not listed'} · Saved {formatDate(item.saved_at)}
          </span>
          {collectionNames.length > 0 && (
            <span className="truncate text-brand-400">In {collectionNames.join(', ')}</span>
          )}
        </div>

        <div className={`mt-3 flex flex-wrap gap-2 ${isList ? '' : 'mt-auto pt-3'}`}>
          <Button
            size="sm"
            onClick={() => onAddToCart(item)}
            disabled={!isAvailable || busy}
            loading={busy}
            title={isAvailable ? undefined : reason ?? undefined}
          >
            <ShoppingCart className="h-4 w-4" />
            {item.has_variants ? 'Choose option' : 'Add to cart'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => onManageCollections(item)} disabled={busy}>
            <FolderOpen className="h-4 w-4" /> Collections
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onRemove(item)} disabled={busy} aria-label={`Remove ${item.title}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}
